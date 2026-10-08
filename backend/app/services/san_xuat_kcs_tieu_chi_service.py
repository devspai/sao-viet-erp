"""Danh mục Tiêu chí KCS — service CRUD + kéo thả + chép sang công đoạn khác.

Thân CRUD dùng chung ở `services/catalog_base.CatalogService`; ở đây chỉ còn luật riêng. Từ mg
`0381` (08/10/2026) một tiêu chí chỉ là MỘT câu chữ, `thu_tu` do máy chủ gán: thêm = nối cuối,
kéo thả (`sap_xep`) = đánh lại 1..n — số client gửi bị bỏ.
"""
from __future__ import annotations

from . import nhat_ky_danh_muc as nk
from ..repositories.san_xuat_kcs_tieu_chi_repo import SanXuatKcsTieuChiRepository
from .catalog_base import (
    CatalogDuplicate, CatalogError, CatalogNotFound, CatalogService, CatalogValidationError,
)


class SanXuatKcsTieuChiError(CatalogError):
    pass


class SanXuatKcsTieuChiValidationError(SanXuatKcsTieuChiError, CatalogValidationError):
    pass


class SanXuatKcsTieuChiDuplicate(SanXuatKcsTieuChiError, CatalogDuplicate):
    pass


class SanXuatKcsTieuChiNotFound(SanXuatKcsTieuChiError, CatalogNotFound):
    pass


class SanXuatKcsTieuChiService(CatalogService):
    LOAI = "san_xuat_kcs_tieu_chi"
    MA_TU_SINH = True       # mã `KM####` do server cấp, UI không có ô nhập mã
    E_NOT_FOUND, E_DUPLICATE, E_VALIDATION = (
        SanXuatKcsTieuChiNotFound, SanXuatKcsTieuChiDuplicate, SanXuatKcsTieuChiValidationError,
    )
    MSG_NOT_FOUND = "Không tìm thấy hạng mục kiểm."
    MSG_DUPLICATE = "Mã đã tồn tại."

    def __init__(self, repo: SanXuatKcsTieuChiRepository, audit=None) -> None:
        super().__init__(repo, audit)

    def _chuan_hoa(self, data: dict) -> dict:
        """Cắt khoảng trắng câu chữ; bỏ `thu_tu` client gửi (máy chủ gán)."""
        data = {k: v for k, v in data.items() if k != "thu_tu"}
        if isinstance(data.get("ten"), str):
            data["ten"] = data["ten"].strip()
        return data

    def _mac_dinh_tao(self, data: dict) -> dict:
        cd = data.get("cong_doan_id")
        return {**data, "thu_tu": self.repo.thu_tu_tiep(int(cd))} if cd else data

    def _validate(self, data: dict, obj=None) -> None:
        ten = (data.get("ten") or (obj.ten if obj is not None else "") or "").strip()
        if not ten:
            raise SanXuatKcsTieuChiValidationError("Tên hạng mục kiểm không được trống.")
        cd = data.get("cong_doan_id", obj.cong_doan_id if obj is not None else None)
        if not cd:
            raise SanXuatKcsTieuChiValidationError("Phải chọn công đoạn cho hạng mục kiểm.")
        cd = int(cd)
        if not self.repo.cong_doan_ids_ton_tai({cd}):
            raise SanXuatKcsTieuChiValidationError(f"Công đoạn không tồn tại: {cd}.")
        if self.repo.trung_ten(cd, ten, tru_id=(obj.id if obj is not None else None)):
            raise SanXuatKcsTieuChiValidationError(
                f"Công đoạn này đã có hạng mục “{ten}”."
            )

    def update(self, item_id: int, data: dict, actor_id: int | None = None):
        """Sửa câu chữ / đổi công đoạn. Đổi sang công đoạn khác thì nối cuối bên đó."""
        obj = self.get(item_id)
        cd = data.get("cong_doan_id")
        if cd and int(cd) != obj.cong_doan_id:
            data = {**self._chuan_hoa(data), "thu_tu": self.repo.thu_tu_tiep(int(cd))}
            self._validate(data, obj)
            truoc = nk.anh_chup(obj)
            obj = self.repo.update(obj, data)
            self._ghi_sua(actor_id, obj, truoc)
            self._chot()
            return obj
        return super().update(item_id, data, actor_id)

    def sap_xep(self, cong_doan_id: int, ids: list[int], actor_id: int | None = None) -> list:
        """Thứ tự MỚI cho TOÀN BỘ tiêu chí một công đoạn (kéo thả). `ids` phải đúng tập tiêu chí
        hiện có — thiếu, thừa (của công đoạn khác) hay lặp đều chặn: màn đang cầm bản cũ."""
        hien = self.repo.cua_cong_doan(int(cong_doan_id))
        theo_id = {r.id: r for r in hien}
        if len(ids) != len(set(ids)) or set(ids) != set(theo_id):
            raise SanXuatKcsTieuChiValidationError(
                "Danh sách tiêu chí đã đổi ở nơi khác — tải lại rồi kéo thả lại."
            )
        for i, tc_id in enumerate(ids, start=1):
            r = theo_id[tc_id]
            if r.thu_tu != i:
                truoc = nk.anh_chup(r)
                r.thu_tu = i
                self._ghi_sua(actor_id, r, truoc)
        self._chot()
        return [theo_id[i] for i in ids]

    def chep(self, den_cong_doan_ids: list[int], tieu_chi: list[str],
             actor_id: int | None = None) -> dict:
        """Chép CÂU CHỮ sang nhiều công đoạn đích trong MỘT giao dịch. Câu cắt khoảng trắng, bỏ
        rỗng, khử trùng giữ thứ tự; đích đã có câu đó thì bỏ qua (đếm `bo_qua`); câu mới nối cuối.
        Một đích không tồn tại ⇒ chặn cả lượt, không đích nào được ghi."""
        cau: list[str] = []
        for t in tieu_chi:
            t = (t or "").strip()
            if t and t not in cau:
                cau.append(t)
        if not cau:
            raise SanXuatKcsTieuChiValidationError("Chưa chọn tiêu chí nào để chép.")
        dich = list(dict.fromkeys(int(i) for i in den_cong_doan_ids))
        if not dich:
            raise SanXuatKcsTieuChiValidationError("Chưa chọn công đoạn đích.")
        thieu = set(dich) - self.repo.cong_doan_ids_ton_tai(set(dich))
        if thieu:
            raise SanXuatKcsTieuChiValidationError(
                f"Công đoạn không tồn tại: {', '.join(str(i) for i in sorted(thieu))}."
            )
        da_co = self.repo.ten_theo_cong_doan(set(dich))
        theo_dich = []
        for cd in dich:
            moi = [t for t in cau if t not in da_co.get(cd, set())]
            tt = self.repo.thu_tu_tiep(cd)
            for k, t in enumerate(moi):
                obj = self.repo.create({
                    "ma": self.repo.next_ma(), "cong_doan_id": cd, "ten": t, "thu_tu": tt + k,
                })
                self._ghi_tao(actor_id, obj)
            theo_dich.append({"cong_doan_id": cd, "da_chep": len(moi), "bo_qua": len(cau) - len(moi)})
        self._chot()
        return {
            "da_chep": sum(d["da_chep"] for d in theo_dich),
            "bo_qua": sum(d["bo_qua"] for d in theo_dich),
            "theo_dich": theo_dich,
        }
