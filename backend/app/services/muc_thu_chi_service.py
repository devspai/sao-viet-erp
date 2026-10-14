"""Danh mục Mục thu chi — service CRUD + hai câu hỏi phiếu thu/chi cần hỏi danh mục.

Thân CRUD dùng chung ở `services/catalog_base.CatalogService`; ở đây chỉ còn luật riêng:
  • danh sách ghép 7 MỤC CỐ ĐỊNH (`MUC_CO_DINH`, id âm, không có dòng trong DB) vào đúng chỗ của
    loại mình — Chi: cố định rồi mục tự khai; Thu: như vậy. Mục cố định không sửa, không ngừng.
"""
from __future__ import annotations

from ..models.muc_thu_chi import LOAI_CHI, LOAI_MUC, MUC_CO_DINH, MUC_CO_DINH_THEO_ID, MucThuChi
from ..repositories.muc_thu_chi_repo import MucThuChiRepository
from .catalog_base import (
    CatalogDuplicate, CatalogError, CatalogInUse, CatalogNotFound, CatalogService,
    CatalogValidationError,
)


class MucThuChiError(CatalogError):
    pass


class MucThuChiValidationError(MucThuChiError, CatalogValidationError):
    pass


class MucThuChiDuplicate(MucThuChiError, CatalogDuplicate):
    pass


class MucThuChiNotFound(MucThuChiError, CatalogNotFound):
    pass


class MucThuChiInUse(MucThuChiError, CatalogInUse):
    pass


class MucThuChiService(CatalogService):
    LOAI = "muc_thu_chi"
    E_NOT_FOUND = MucThuChiNotFound
    E_DUPLICATE = MucThuChiDuplicate
    E_VALIDATION = MucThuChiValidationError
    E_IN_USE = MucThuChiInUse
    MSG_NOT_FOUND = "Không tìm thấy mục thu chi."
    MSG_DUPLICATE = "Mã mục đã tồn tại."
    MSG_IN_USE = "Không xóa được — mục đã có {ly_do}. Ngừng dùng mục thay vì xóa."
    MA_TU_SINH = True
    # Xoá theo luật chung của danh mục (12/10/2026, như màn Giấy): mục chưa phiếu nào mang ⇒ xoá
    # hẳn; đã có phiếu ⇒ `_blockers` chặn, màn chỉ cho Ngừng dùng (`PATCH /{id}/active`). Trước đó
    # `XOA_MEM` biến mọi lần "xoá hẳn" thành ngừng dùng — hộp thoại nói xoá hẳn mà mục vẫn nằm lại.

    def _blockers(self, obj) -> list[str]:
        from .danh_muc_tham_chieu import tham_chieu

        return tham_chieu(self.repo.db, self.LOAI, obj).chan

    def __init__(self, repo: MucThuChiRepository, audit=None) -> None:
        super().__init__(repo, audit)

    # -- luật khai --------------------------------------------------------------------------

    def _chuan_hoa(self, data: dict) -> dict:
        d = dict(data)
        if "ten" in d and d["ten"] is not None:
            d["ten"] = d["ten"].strip()
        if "ghi_chu" in d:
            d["ghi_chu"] = (d["ghi_chu"] or "").strip() or None
        return d

    def _validate(self, data: dict, obj=None) -> None:
        if not (data.get("ten") or "").strip():
            raise MucThuChiValidationError("Tên mục không được trống.")
        loai = data.get("loai")
        if loai not in LOAI_MUC:
            raise MucThuChiValidationError("Chọn loại mục: Thu hoặc Chi.")

    # -- mục cố định: chỉ đọc --------------------------------------------------------------

    def get(self, item_id: int):
        m = MUC_CO_DINH_THEO_ID.get(int(item_id))
        if m is not None:
            raise MucThuChiValidationError(
                f"«{m['ten']}» là mục cố định của {m['ghi_chu'].lower()}, không sửa hay ngừng được.")
        return super().get(item_id)

    @staticmethod
    def _khop_co_dinh(m: dict, *, q=None, active=None, loai=None, tu_ngay=None, den_ngay=None,
                      **_) -> bool:
        """Mục cố định có lọt bộ lọc của danh sách không. Không có ngày tạo ⇒ lọc kỳ là loại."""
        if tu_ngay is not None or den_ngay is not None or active is False:
            return False
        if loai and m["loai"] != loai:
            return False
        tim = (q or "").strip().lower()
        return not tim or tim in m["ma"].lower() or tim in m["ten"].lower()

    def list(self, *, page: int = 1, size: int = 50, **kw):
        """Trang danh sách: theo từng loại (Chi rồi Thu), mục cố định đứng trước mục tự khai.
        Cắt trang trên dãy ghép đó — mỗi khúc dòng thật hỏi DB đúng phần nằm trong trang."""
        page, size = max(1, page), max(1, min(size, 200))
        dau, cuoi = (page - 1) * size, page * size
        loai_loc = kw.pop("loai", None)
        ra: list = []
        total = 0
        for loai in sorted(LOAI_MUC):          # "chi" < "thu" — cùng thứ tự `order_cols`
            if loai_loc and loai != loai_loc:
                continue
            co_dinh = [dict(m, active=True, co_dinh=True) for m in MUC_CO_DINH
                       if m["loai"] == loai and self._khop_co_dinh(m, loai=loai, **kw)]
            for m in co_dinh:
                if dau <= total < cuoi:
                    ra.append(m)
                total += 1
            bo_qua = max(0, dau - total)
            lay = max(0, cuoi - max(dau, total))
            dong, n = self.repo.list_tu(bo_qua=bo_qua, lay=lay, loai=loai, **kw)
            ra.extend(dong)
            total += n
        return ra, total

    def dem_theo_cot(self, cot, **kw) -> list[dict]:
        """Số trên thanh lọc — cộng mục cố định vào ô Bên (Thu/Chi) và ô Đang dùng."""
        dem = super().dem_theo_cot(cot, **kw)
        if cot not in ("loai", "active"):
            return dem
        for m in MUC_CO_DINH:
            if not self._khop_co_dinh(m, **kw):
                continue
            khoa = m["loai"] if cot == "loai" else "true"
            o = next((d for d in dem if d["value"] == khoa), None)
            if o is None:
                o = {"value": khoa, "nhan": self.repo.nhan_cot.get("loai", {}).get(khoa) if cot == "loai" else None,
                     "so": 0}
                dem.append(o)
            o["so"] += 1
        return dem

    def da_dung(self, ids: list[int]) -> dict[int, int]:
        return self.repo.da_dung(ids)

    # -- phiếu hỏi danh mục -----------------------------------------------------------------

    def kiem_muc(self, muc_id: int | None, loai: str) -> MucThuChi:
        """Mục phiếu được phép mang: có thật, đang dùng, đúng loại. Sai thì ném lỗi tiếng Việt."""
        chu = "chi" if loai == LOAI_CHI else "thu"
        if not muc_id:
            raise MucThuChiValidationError(f"Chọn mục {chu}.")
        co_dinh = MUC_CO_DINH_THEO_ID.get(int(muc_id))
        if co_dinh is not None:
            raise MucThuChiValidationError(
                f"«{co_dinh['ten']}» là mục cố định của {co_dinh['ghi_chu'].lower()}, không chọn tay được.")
        muc = self.repo.get(int(muc_id))
        if muc is None:
            raise MucThuChiValidationError(f"Không tìm thấy mục {chu} đã chọn.")
        if not muc.active:
            raise MucThuChiValidationError(f"Mục «{muc.ten}» đã ngừng dùng.")
        if muc.loai != loai:
            raise MucThuChiValidationError(f"«{muc.ten}» là mục {muc.loai}, không dùng cho phiếu {chu}.")
        return muc
