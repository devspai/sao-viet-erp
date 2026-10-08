"""Xếp lịch — trải thời lượng các bước lên giờ làm việc. HÀM THUẦN, không DB, không ORM.

Tách khỏi `service.py` có chủ đích: đây là phép tính DUY NHẤT mà cả bốn chỗ tiêu thụ lịch đều đi
qua (giữ chỗ vật tư · kế hoạch NVL · bàn tổ · máy đang chạy), nên nó phải kiểm được bằng số mà
không cần dựng đơn → lệnh → routing.

Dùng khung THEO CA (`LichXuong` với `lien_tuc=False`) — khác module 2 vốn cho máy chạy trọn ngày.
Đây chính là chỗ "cộng thêm thời gian nghỉ giữa ca và ngoài ca" mà mục tiêu module đòi: thanh trên
bàn Gantt dài bằng thời gian LỊCH, còn tổng các đoạn bên trong mới là giờ máy chạy thật.

Mốc vào/ra là WALL-CLOCK naive (giờ nhà máy); bên trong `LichXuong` tính tz-aware, nên vào phải
`_aware`, ra phải `_naive`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from ..xep_lich_service import (
    GIO_BAT_DAU,
    PHUT_LAM_NGAY,
    _aware,
    _cong_gio_lam,
    _naive,
    _vao_gio_lam,
)


@dataclass(frozen=True)
class BuocVao:
    """Một bước routing đã quy về SỐ — service lo dịch từ `LsxCongDoan` sang đây."""

    lsx_cong_doan_id: int
    thu_tu: int
    chay_phut: float
    la_thue_ngoai: bool = False
    # Vì sao bước này KHÔNG tính được giờ (chưa gán máy · chưa quy đổi được đơn vị…). Có câu này
    # mà `chay_phut == 0` nghĩa là ngày kết thúc đang bị TÍNH THIẾU — thanh phải nói ra.
    canh_bao: str | None = None


@dataclass(frozen=True)
class DoanChay:
    """Một đoạn máy CHẠY liền mạch trong ca — lớp đậm của thanh hai lớp trên Gantt."""

    tu: datetime
    den: datetime
    buoc_index: int


@dataclass(frozen=True)
class MocBuoc:
    lsx_cong_doan_id: int
    thu_tu: int
    bat_dau: datetime
    ket_thuc: datetime
    chay_phut: float
    # Quãng `bat_dau → ket_thuc` của bước này là NGÀY LỊCH nhà cung cấp giữ, không phải giờ nghỉ.
    la_thue_ngoai: bool = False
    # Bước SẴN SÀNG theo chuỗi của chính lệnh lúc `cho_tu` nhưng phải đợi lệnh khác tới `bat_dau`
    # (mục 5b, 08/10/2026). None = không chờ ai.
    cho_tu: datetime | None = None


@dataclass(frozen=True)
class DoanCho:
    """Quãng lệnh ĐỨNG CHỜ lệnh khác trong cụm — lớp vàng trên thanh. Dẫn xuất, không lưu."""

    tu: datetime
    den: datetime
    lsx_cong_doan_id: int


@dataclass(frozen=True)
class KetQuaTrai:
    bat_dau: datetime
    ket_thuc: datetime
    da_doi: bool
    chay_phut: float
    doan: list[DoanChay] = field(default_factory=list)
    buoc: list[MocBuoc] = field(default_factory=list)
    ghi_chu: list[str] = field(default_factory=list)
    cho: list[DoanCho] = field(default_factory=list)

    @property
    def cho_phut(self) -> float:
        return sum(_phut(c.tu, c.den) for c in self.cho)


def trai_lich(moc: datetime, buoc: list[BuocVao], lich,
              som: dict[int, datetime] | None = None) -> KetQuaTrai:
    """Trải `buoc` (sắp theo `thu_tu`) từ `moc`; trả mốc lệnh + mốc từng bước + các đoạn chạy.

    Chuỗi bám `thu_tu`, KHÔNG bám `phu_thuoc` và cũng không bám thứ tự người gọi truyền vào.

    `som[lsx_cong_doan_id]` = giờ sớm nhất bước đó được bắt đầu vì phải đợi LỆNH KHÁC (bước trước
    ở lệnh khác, hoặc bước in chung bài ghép). Tới bước đó mà chuỗi của lệnh xong sớm hơn thì lệnh
    đứng CHỜ — quãng chờ ghi vào `cho`, không phải giờ chạy cũng không phải nghỉ. `trai_cum` lo
    tính `som`; gọi lẻ thì bỏ trống như trước.

    Mốc rơi vào nghỉ giữa ca / ngoài ca / ngày nghỉ thì TRƯỢT tới đầu khoảng chạy được gần nhất và
    bật `da_doi` — đây là làm tròn cho phép cộng có nghĩa, KHÔNG phải cửa chặn: module này không
    chặn gì hết, chỉ báo cho người biết mốc đã dời đi đâu.
    """
    dau = _vao_gio_lam(_aware(moc), lich)
    da_doi = _naive(dau) != moc
    con: datetime = dau
    doan: list[DoanChay] = []
    moc_buoc: list[MocBuoc] = []
    ghi_chu: list[str] = []
    tong_chay = 0.0
    cho: list[DoanCho] = []
    som = som or {}

    for i, b in enumerate(sorted(buoc, key=lambda x: (x.thu_tu, x.lsx_cong_doan_id))):
        cho_tu = None
        doi = som.get(b.lsx_cong_doan_id)
        if doi is not None:
            doi_aw = _vao_gio_lam(_aware(doi), lich)
            if doi_aw > con:
                cho_tu = _naive(con)
                cho.append(DoanCho(tu=cho_tu, den=_naive(doi_aw), lsx_cong_doan_id=b.lsx_cong_doan_id))
                con = doi_aw
        b_dau = con
        if b.la_thue_ngoai:
            # Gia công ngoài KHÔNG chiếm thời gian trên lịch (spec 2026-09-26 §8): ngày kết thúc là
            # ngày XƯỞNG làm xong phần của mình. Nói ra một lần để không ai tưởng đó là lịch trọn.
            if "Không tính thời gian gia công ngoài." not in ghi_chu:
                ghi_chu.append("Không tính thời gian gia công ngoài.")
        elif b.chay_phut > 0:
            doan.extend(_cat_doan(b_dau, b.chay_phut, i, lich))
            con = _cong_gio_lam(con, b.chay_phut, lich)
            tong_chay += b.chay_phut
        elif b.canh_bao:
            # Bước chiếm 0 phút vì THIẾU DỮ KIỆN, không vì nó nhanh: lệnh sẽ xong muộn hơn ngày
            # màn đang bày. Trước 10/09/2026 chỗ này im lặng — bước Dán chưa gán máy lọt qua
            # không một dòng nào, lịch nhảy thẳng từ Bế sang Đóng gói.
            cau = f"Bước {b.thu_tu} chưa tính được giờ nên lệnh có thể xong muộn hơn. {b.canh_bao}"
            if cau not in ghi_chu:
                ghi_chu.append(cau)
        moc_buoc.append(MocBuoc(
            lsx_cong_doan_id=b.lsx_cong_doan_id, thu_tu=b.thu_tu,
            bat_dau=_naive(b_dau), ket_thuc=_naive(con), chay_phut=b.chay_phut,
            la_thue_ngoai=b.la_thue_ngoai, cho_tu=cho_tu,
        ))

    return KetQuaTrai(
        bat_dau=_naive(dau), ket_thuc=_naive(con), da_doi=da_doi,
        chay_phut=tong_chay, doan=doan, buoc=moc_buoc, ghi_chu=ghi_chu, cho=cho,
    )


CAU_VONG = "Các lệnh trong cụm chờ vòng tròn lẫn nhau nên giờ chờ có thể chưa đúng. Kiểm lại quy trình."


def trai_cum(
    dau_vao: dict[int, tuple[datetime, list[BuocVao]]],
    canh: list[tuple[int, int]],
    chung: list[set[int]],
    lich,
    max_luot: int = 8,
) -> dict[int, KetQuaTrai]:
    """Trải CẢ CỤM lệnh có ràng buộc chéo (mục 5b, 08/10/2026) — trả `{lsx_id: KetQuaTrai}`.

    `dau_vao[lsx_id] = (mốc bắt đầu, các bước)` — chỉ lệnh ĐÃ có mốc; lệnh chưa xếp không có giờ
    nên không ràng buộc ai. `canh` = cặp `(bước trước, bước sau)` nằm ở hai lệnh khác nhau: bước sau
    không bắt đầu trước khi bước trước xong. `chung` = các nhóm bước in chung một bài ghép: cả nhóm
    bắt đầu cùng lúc, lúc thành viên sẵn sàng MUỘN NHẤT.

    Mỗi lượt trải từng lệnh với `som` hiện có rồi tính `som` mới từ kết quả. `som` chỉ tăng nên
    lặp tới khi đứng yên; vòng phụ thuộc thì không bao giờ đứng ⇒ dừng sau `max_luot` lượt và ghi
    chú lên các lệnh còn đang xê dịch — báo, không chặn (module này không chặn gì).
    """
    som: dict[int, datetime] = {}
    kq: dict[int, KetQuaTrai] = {}
    for _ in range(max_luot):
        kq = {lid: trai_lich(m, b, lich, som) for lid, (m, b) in dau_vao.items()}
        xong: dict[int, datetime] = {}
        san_sang: dict[int, datetime] = {}
        for k in kq.values():
            for mb in k.buoc:
                xong[mb.lsx_cong_doan_id] = mb.ket_thuc
                san_sang[mb.lsx_cong_doan_id] = mb.cho_tu or mb.bat_dau
        moi: dict[int, datetime] = {}
        for truoc, sau in canh:
            if truoc in xong and sau in xong:
                if sau not in moi or xong[truoc] > moi[sau]:
                    moi[sau] = xong[truoc]
        for nhom in chung:
            co = [c for c in nhom if c in san_sang]
            if len(co) < 2:
                continue
            # Sẵn sàng của từng thành viên = chuỗi của chính nó, hoặc bước trước ở lệnh khác.
            muon = max(max(san_sang[c], moi.get(c, san_sang[c])) for c in co)
            for c in co:
                moi[c] = muon
        if moi == som:
            return kq
        som = moi
    lech = {lid for lid, k in kq.items() if any(mb.lsx_cong_doan_id in som for mb in k.buoc)}
    return {
        lid: (KetQuaTrai(
            bat_dau=k.bat_dau, ket_thuc=k.ket_thuc, da_doi=k.da_doi, chay_phut=k.chay_phut,
            doan=k.doan, buoc=k.buoc, ghi_chu=[*k.ghi_chu, CAU_VONG], cho=k.cho,
        ) if lid in lech else k)
        for lid, k in kq.items()
    }


def _cat_doan(tu: datetime, chay_phut: float, buoc_index: int, lich) -> list[DoanChay]:
    """Cắt `chay_phut` từ `tu` thành các đoạn CHẠY LIỀN MẠCH, bỏ nghỉ giữa ca / ngoài ca / ngày nghỉ.

    Đi theo chính các khoảng làm-việc mà `lich.next_interval` cấp — cùng nguồn `_cong_gio_lam` đi,
    nên đoạn cuối không bao giờ lệch mốc kết thúc của bước. Tổng các đoạn LUÔN bằng `chay_phut`.
    `next_interval` tự chặn vòng bằng `_MAX_NGAY`, không có đường lặp vô hạn.
    """
    ra: list[DoanChay] = []
    con = float(chay_phut)
    cur = tu
    for _ in range(5000):
        if con <= 1e-9:
            break
        iv = lich.next_interval(cur)
        if iv is None:          # hết khung trong tầm `_MAX_NGAY` — trả những gì đã cắt được
            break
        seg_start, seg_end = iv
        if cur < seg_start:
            cur = seg_start
        an = min((seg_end - cur).total_seconds() / 60.0, con)
        if an <= 0:             # con trỏ đúng mép phải khoảng: nhảy sang khoảng kế
            cur = seg_end
            continue
        ra.append(DoanChay(
            tu=_naive(cur), den=_naive(cur + timedelta(minutes=an)), buoc_index=buoc_index,
        ))
        con -= an
        cur = cur + timedelta(minutes=an)
    return ra


def _hhmm(phut: int, la_mep_phai: bool = False) -> str:
    """Phút trong ngày → "HH:MM". Mép PHẢI đúng nửa đêm ghi "24:00": "06:00–00:00" đọc như ca rỗng."""
    p = int(phut) % 1440
    if la_mep_phai and p == 0 and int(phut) > 0:
        return "24:00"
    return f"{p // 60:02d}:{p % 60:02d}"


def mo_ta_ca(ca_rows) -> list[dict]:
    """Tập ca xưởng → `[{ten, tu, den, nghi_tu, nghi_den}]` cho dòng "Ca 1 06:00–15:00 (nghỉ 12:00–13:00)".

    Khung gộp "06:00–24:00" giấu mất bữa nghỉ nào thuộc ca nào, người đọc phải mở màn Khai ca ra đối
    chiếu. Nghỉ ở đây là số KHAI của ca; khi ca gối nhau thì nghỉ HIỆU LỰC có thể hẹp hơn
    (`doan_nghi_trong_ngay`) — con số đó nằm ở dòng "Nghỉ giữa ca", không phải ở đây.
    """
    ra: list[dict] = []
    for c in ca_rows:
        s, e = int(c.start_minute), int(c.end_minute)
        qua_dem = bool(getattr(c, "is_overnight", False)) or e <= s
        nb, nk = getattr(c, "break_start_minute", None), getattr(c, "break_end_minute", None)
        co_nghi = nb is not None and nk is not None and int(nb) != int(nk)
        ra.append({
            "ten": c.name,
            "tu": _hhmm(s),
            "den": _hhmm(e + (1440 if qua_dem else 0), la_mep_phai=True),
            "nghi_tu": _hhmm(int(nb)) if co_nghi else None,
            "nghi_den": (_hhmm(int(nk) + (1440 if int(nk) <= int(nb) else 0), la_mep_phai=True)
                         if co_nghi else None),
        })
    return ra


def _giao(a: datetime, b: datetime, khoang: list[tuple[datetime, datetime]]):
    """Tách `[a, b)` thành (các mảnh NẰM TRONG `khoang`, các mảnh NẰM NGOÀI). `khoang` đã sort, rời nhau."""
    trong: list[tuple[datetime, datetime]] = []
    ngoai: list[tuple[datetime, datetime]] = []
    cur = a
    for s, e in khoang:
        if e <= cur or s >= b:
            continue
        if s > cur:
            ngoai.append((cur, s))
        trong.append((max(s, cur), min(e, b)))
        cur = min(e, b)
        if cur >= b:
            break
    if cur < b:
        ngoai.append((cur, b))
    return trong, ngoai


def _phut(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 60.0


def _gom_khung(manh: list[tuple[datetime, datetime]]) -> list[dict]:
    """Nối mảnh liền nhau (ngoài ca vắt qua nửa đêm) rồi gom theo khung giờ `HH:MM–HH:MM` + đếm số lần."""
    noi: list[list[datetime]] = []
    for s, e in sorted(manh):
        if noi and s <= noi[-1][1]:
            noi[-1][1] = max(noi[-1][1], e)
        else:
            noi.append([s, e])
    gom: dict[tuple[str, str], dict] = {}
    for s, e in noi:
        k = (_hhmm(s.hour * 60 + s.minute),
             _hhmm(e.hour * 60 + e.minute + (1440 if e.date() > s.date() and e.time() == time() else 0),
                   la_mep_phai=True))
        g = gom.setdefault(k, {"tu": k[0], "den": k[1], "so_lan": 0, "phut": 0.0})
        g["so_lan"] += 1
        g["phut"] += _phut(s, e)
    for g in gom.values():
        g["phut"] = round(g["phut"], 2)
    return sorted(gom.values(), key=lambda g: g["tu"])     # theo giờ trong ngày: 12:00 trước 18:00


def phan_tach_nghi(kq: KetQuaTrai, lich) -> dict:
    """Tách phần KHÔNG CHẠY của thanh (`ket_thuc - bat_dau - chay_phut`) ra từng loại, kèm giờ cụ thể.

    Con số gộp "nghỉ" không trả lời được câu người điều độ hỏi tiếp: nghỉ giữa ca bao lâu, từ mấy
    giờ; ngày nghỉ là những ngày nào. Năm loại, cộng lại ĐÚNG bằng con số gộp:

      · gia công ngoài — quãng ngày lịch của bước thuê ngoài (không phải nghỉ, nhưng cũng không chạy)
      · chờ lệnh khác  — quãng `kq.cho` (5b): bước đã sẵn sàng nhưng đợi lệnh khác trong cụm
      · ngày nghỉ      — phần rơi vào ngày `is_working_day = False`, theo ngày lịch
      · nghỉ giữa ca   — phần nằm TRONG khung ca (chưa khoét bữa nghỉ) của ngày làm việc
      · ngoài ca       — phần còn lại của ngày làm việc (tối/đêm ngoài giờ ca)

    Khoảng hở = `[bat_dau, ket_thuc]` trừ hợp các đoạn chạy; tổng các đoạn luôn bằng `chay_phut`
    (`_cat_doan`), nên tổng năm loại khớp `nghi_ngoai_ca_phut` của `_so_lich`. Hàm thuần: chỉ đọc
    `lich.cal.is_working_day` (đã cache theo năm) và khung ca — không thêm truy vấn nào.
    """
    ho: list[tuple[datetime, datetime]] = []
    cur = kq.bat_dau
    for d in sorted(kq.doan, key=lambda x: x.tu):
        if d.tu > cur:
            ho.append((cur, d.tu))
        cur = max(cur, d.den)
    if kq.ket_thuc > cur:
        ho.append((cur, kq.ket_thuc))

    thue = sorted((b.bat_dau, b.ket_thuc) for b in kq.buoc
                  if b.la_thue_ngoai and b.ket_thuc > b.bat_dau)
    # Chờ lệnh khác (5b) tách trước như gia công ngoài: cả quãng là "đứng đợi", kể cả đêm nằm trong
    # nó — ô "Ngoài ca N đêm" chỉ đếm những đêm lệnh đang dở việc của chính mình.
    doi = sorted((c.tu, c.den) for c in kq.cho if c.den > c.tu)
    cho_phut = 0.0
    gia_cong = 0.0
    giua_ca: list[tuple[datetime, datetime]] = []
    ngoai_ca: list[tuple[datetime, datetime]] = []
    ngay_nghi: dict[date, float] = {}
    for a, b in ho:
        trong_thue, sau_thue = _giao(a, b, thue)
        gia_cong += sum(_phut(s, e) for s, e in trong_thue)
        con_lai: list[tuple[datetime, datetime]] = []
        for a2, b2 in sau_thue:
            trong_cho, ngoai_cho = _giao(a2, b2, doi)
            cho_phut += sum(_phut(s, e) for s, e in trong_cho)
            con_lai += ngoai_cho
        for x, y in con_lai:
            ngay = x.date()
            while True:
                dau = datetime(ngay.year, ngay.month, ngay.day)
                s, e = max(x, dau), min(y, dau + timedelta(days=1))
                if s >= y:
                    break
                if s < e:
                    if not lich.cal.is_working_day(ngay):
                        ngay_nghi[ngay] = ngay_nghi.get(ngay, 0.0) + _phut(s, e)
                    else:
                        khung = [(_naive(p), _naive(q)) for p, q in lich._khung_ngay_tho(ngay)]
                        trong, ngoai = _giao(s, e, khung)
                        giua_ca += trong
                        ngoai_ca += ngoai
                ngay = ngay + timedelta(days=1)

    cas = sorted((s, e + 1440 if qua_dem else e) for s, e, qua_dem in lich.cas) or [
        (GIO_BAT_DAU * 60, GIO_BAT_DAU * 60 + PHUT_LAM_NGAY)
    ]
    ca_gop: list[list[int]] = []
    for s, e in cas:
        if ca_gop and s <= ca_gop[-1][1]:
            ca_gop[-1][1] = max(ca_gop[-1][1], e)
        else:
            ca_gop.append([s, e])
    return {
        "ca_san_xuat": [{"tu": _hhmm(s), "den": _hhmm(e, la_mep_phai=True)} for s, e in ca_gop],
        "nghi_giua_ca_phut": round(sum(_phut(s, e) for s, e in giua_ca), 2),
        "nghi_giua_ca": _gom_khung(giua_ca),
        "ngoai_ca_phut": round(sum(_phut(s, e) for s, e in ngoai_ca), 2),
        "ngoai_ca": _gom_khung(ngoai_ca),
        "ngay_nghi_phut": round(sum(ngay_nghi.values()), 2),
        "ngay_nghi": [{"ngay": d, "phut": round(p, 2)} for d, p in sorted(ngay_nghi.items())],
        "gia_cong_ngoai_phut": round(gia_cong, 2),
        "cho_lenh_khac_phut": round(cho_phut, 2),
    }
