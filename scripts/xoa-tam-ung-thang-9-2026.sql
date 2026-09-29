-- =============================================================================
-- XOÁ TẤT CẢ PHIẾU Ở TAB "TẠM ỨNG" CỦA KỲ LƯƠNG 9/2026
-- (màn Lương → Tạm ứng → Tháng 9/2026 → "Tất cả" + "Mọi loại")
-- Gồm CẢ hai loại: Tạm ứng (tam_ung) và Lương đợt 1 (luong_dot_1), MỌI trạng thái
-- (chờ duyệt · đã duyệt · đã chi · từ chối · huỷ). Kỳ khác KHÔNG bị đụng.
-- Postgres 16 (service `db` trong docker-compose trên VPS)
--
-- Chạy trên VPS, từ thư mục có docker-compose.yml. Biến POSTGRES_* chỉ có BÊN TRONG container
-- (shell root trên VPS không có) ⇒ phải bọc `sh -c '…'` NHÁY ĐƠN:
--
--   docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--       < scripts/xoa-tam-ung-thang-9-2026.sql
--
-- SAO LƯU TRƯỚC (bắt buộc — xoá rồi là không hoàn lại được; file phải cỡ MB, rỗng là hỏng):
--   docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > svn-$(date +%F-%H%M).sql
--
-- MẶC ĐỊNH KẾT THÚC BẰNG ROLLBACK: lần chạy đầu chỉ để XEM. Đọc bảng + NOTICE, khớp với màn hình
-- (Tất cả 122 · Chờ duyệt 120 · Đã chi 1 · Từ chối/Huỷ 1) rồi mới đổi ROLLBACK ở cuối thành COMMIT.
--
-- PHIẾU ĐÃ CHI: tiền đã ra két qua một PHIẾU CHI. Xoá phiếu tạm ứng thì phiếu chi đó mồ côi ⇒
-- script XOÁ LUÔN phiếu chi, với điều kiện phiếu chi đó chỉ chi cho phiếu của kỳ 9/2026. Phiếu chi
-- chi chung với phiếu kỳ khác ⇒ DỪNG. Số chứng từ (PC000xx) của phiếu chi bị xoá để lại một lỗ trong
-- dãy số. File đính kèm của phiếu chi: dòng DB xoá theo (CASCADE), file trong kho MinIO nằm lại.
--
-- PHIẾU LƯƠNG 9/2026: `advance_total` / `luong_dot_1_total` là số chụp lúc Tính lương, kéo theo
-- thực lĩnh + nợ ứng chuyển kỳ — SQL không tính lại đúng được. Kỳ còn NHÁP ⇒ xoá xong bấm "Tính
-- lại" ở màn Lương. Kỳ đã CHỐT / ĐÃ CHI mà phiếu lương đang trừ tiền ứng ⇒ DỪNG, mở lại kỳ trước.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BƯỚC 0 — XEM TRƯỚC (chỉ đọc)
-- -----------------------------------------------------------------------------
-- 0a. Số phiếu theo loại + trạng thái.
SELECT sa.kind AS loai, sa.status AS trang_thai, count(*) AS so_phieu, sum(sa.amount) AS tong_tien
FROM salary_advances sa
WHERE sa.period_year = 2026 AND sa.period_month = 9
GROUP BY ROLLUP (1, 2)
ORDER BY 1, 2;

-- 0b. Phiếu chi đang chi cho các phiếu này (sẽ bị xoá theo) — có chi chung phiếu kỳ khác không.
WITH t AS (SELECT id, payment_voucher_id FROM salary_advances
           WHERE period_year = 2026 AND period_month = 9),
pc AS (
    SELECT payment_voucher_id AS id FROM t WHERE payment_voucher_id IS NOT NULL
    UNION
    SELECT pv.id FROM payment_vouchers pv JOIN t ON pv.salary_advance_id = t.id
)
SELECT pv.code AS phieu_chi, pv.doc_no AS so_chung_tu, pv.status AS trang_thai, pv.amount AS so_tien,
       (SELECT count(*) FROM salary_advances sa
         WHERE (sa.payment_voucher_id = pv.id OR sa.id = pv.salary_advance_id)
           AND NOT (sa.period_year = 2026 AND sa.period_month = 9)) AS so_phieu_ky_khac
FROM payment_vouchers pv
WHERE pv.id IN (SELECT id FROM pc)
ORDER BY pv.code;

-- 0c. Kỳ lương 9/2026 và số tiền ứng đang trừ trên phiếu lương.
SELECT pp.year AS nam, pp.month AS thang, pp.status AS trang_thai_ky,
       count(pl.id) FILTER (WHERE pl.advance_total <> 0 OR pl.luong_dot_1_total <> 0) AS so_phieu_luong_dang_tru,
       coalesce(sum(pl.advance_total), 0)     AS tong_tam_ung,
       coalesce(sum(pl.luong_dot_1_total), 0) AS tong_luong_dot_1
FROM payroll_periods pp
LEFT JOIN payroll_lines pl ON pl.period_id = pp.id
WHERE pp.year = 2026 AND pp.month = 9
GROUP BY 1, 2, 3;


-- -----------------------------------------------------------------------------
-- BƯỚC 1 — XOÁ (một giao dịch; sai ở đâu là rollback sạch, không xoá dở)
-- -----------------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE phieu_xoa ON COMMIT DROP AS
SELECT id FROM salary_advances WHERE period_year = 2026 AND period_month = 9;

CREATE TEMP TABLE phieu_chi_xoa ON COMMIT DROP AS
SELECT sa.payment_voucher_id AS id
FROM salary_advances sa
WHERE sa.id IN (SELECT id FROM phieu_xoa) AND sa.payment_voucher_id IS NOT NULL
UNION
SELECT pv.id FROM payment_vouchers pv
WHERE pv.salary_advance_id IN (SELECT id FROM phieu_xoa);

DO $do$
DECLARE
    n     bigint;
    chan  text;
BEGIN
    SELECT count(*) INTO n FROM phieu_xoa;
    RAISE NOTICE 'Phiếu tạm ứng / lương đợt 1 kỳ 9/2026 sẽ xoá: %', n;
    IF n = 0 THEN
        RAISE EXCEPTION 'Kỳ 9/2026 không có phiếu nào — không có gì để xoá.';
    END IF;

    -- Chặn 1: phiếu chi chi CHUNG với phiếu của kỳ khác — xoá là mất chứng từ của kỳ kia.
    SELECT string_agg(DISTINCT pv.code, ', ') INTO chan
    FROM payment_vouchers pv
    JOIN salary_advances sa ON (sa.payment_voucher_id = pv.id OR sa.id = pv.salary_advance_id)
    WHERE pv.id IN (SELECT id FROM phieu_chi_xoa)
      AND sa.id NOT IN (SELECT id FROM phieu_xoa);
    IF chan IS NOT NULL THEN
        RAISE EXCEPTION 'DỪNG — phiếu chi % chi chung với phiếu tạm ứng của kỳ khác. Huỷ/tách phiếu chi đó ở màn Kế toán rồi chạy lại.', chan;
    END IF;

    -- Chặn 2: phiếu thu hoàn tiền trỏ vào phiếu chi (khoá ngoại RESTRICT).
    SELECT string_agg(pr.code, ', ') INTO chan
    FROM payment_receipts pr WHERE pr.payment_voucher_id IN (SELECT id FROM phieu_chi_xoa);
    IF chan IS NOT NULL THEN
        RAISE EXCEPTION 'DỪNG — phiếu thu % đang trỏ vào phiếu chi sắp xoá.', chan;
    END IF;

    -- Chặn 3: kỳ 9/2026 đã chốt / đã chi mà phiếu lương đang trừ tiền ứng.
    SELECT pp.status INTO chan
    FROM payroll_periods pp
    WHERE pp.year = 2026 AND pp.month = 9 AND pp.status <> 'draft'
      AND EXISTS (SELECT 1 FROM payroll_lines pl WHERE pl.period_id = pp.id
                   AND (pl.advance_total <> 0 OR pl.luong_dot_1_total <> 0));
    IF chan IS NOT NULL THEN
        RAISE EXCEPTION 'DỪNG — kỳ lương 9/2026 đang "%" và phiếu lương đang trừ tiền ứng. Mở lại kỳ rồi chạy lại.', chan;
    END IF;

    -- Gỡ liên kết phiếu tạm ứng → phiếu chi trước (hai bảng trỏ nhau), rồi mới xoá.
    UPDATE salary_advances SET payment_voucher_id = NULL WHERE id IN (SELECT id FROM phieu_xoa);

    DELETE FROM payment_vouchers WHERE id IN (SELECT id FROM phieu_chi_xoa);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'ĐÃ XOÁ % phiếu chi (đính kèm xoá theo).', n;

    DELETE FROM salary_advances WHERE id IN (SELECT id FROM phieu_xoa);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'ĐÃ XOÁ % phiếu tạm ứng / lương đợt 1.', n;

    IF EXISTS (SELECT 1 FROM payroll_lines pl JOIN payroll_periods pp ON pp.id = pl.period_id
                WHERE pp.year = 2026 AND pp.month = 9
                  AND (pl.advance_total <> 0 OR pl.luong_dot_1_total <> 0)) THEN
        RAISE NOTICE 'Phiếu lương 9/2026 còn số ứng cũ — vào Lương → Bảng lương tháng 9/2026, bấm "Tính lại".';
    END IF;
    IF EXISTS (SELECT 1 FROM payroll_periods WHERE (year, month) > (2026, 9)) THEN
        RAISE NOTICE 'Đã có kỳ lương SAU 9/2026 — nợ ứng chuyển kỳ có thể còn mang số cũ, "Tính lại" cả kỳ đó.';
    END IF;
END
$do$;

ROLLBACK;
-- ↑ Đọc bảng BƯỚC 0 + NOTICE ở trên. Số khớp thì đổi ROLLBACK thành COMMIT rồi chạy lại cả file.
