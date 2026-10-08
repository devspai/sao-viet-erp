# Xếp lịch làm lại theo phương án A (08/10/2026)

Nguồn duyệt: `docs/mockups/xep-lich-A-cai-tien.html` (mục 1–7, các ô "Đã chốt") + khung ngăn ở
`docs/mockups/xep-lich-phuong-an-A.html`. User nói "làm đi" 08/10/2026.

## Giả định đã chốt khi làm (nói lại lúc báo cáo)

- Lớp THỰC TẾ (lệnh đã chạy dở, `_du_kien_theo_thuc_te`) giữ nguyên cách tính từng lệnh; ràng buộc
  cụm (5b) áp cho lịch KẾ HOẠCH và cho phần chưa bắt đầu của `moc_cong_doan`.
- Lệnh trong cụm mà CHƯA có mốc thì không ràng buộc ai (không có giờ để chờ); dải nối vẫn hiện, ghi
  "chưa xếp lịch".
- Tình trạng vật tư đi endpoint RIÊNG, FE gọi sau khi lịch đã vẽ — bảng cân đối đắt (40–77 câu SQL),
  không nhét vào `/lich`.
- Vòng phụ thuộc (cụm tự chờ chính nó): dừng sau 8 lượt, ghi chú lên lệnh, không chặn.

## Việc

| # | Việc | Trạng thái |
|---|------|-----------|
| 1 | Engine thuần: `trai_lich(..., som=)` sinh đoạn chờ; `trai_cum` lặp tới ổn định | Xong |
| 2 | Service: nạp ràng buộc cụm (cạnh chéo + bước chung bài ghép), áp vào `lich` / `chi_tiet` / `moc_cong_doan` / `dat_moc`; payload chờ + dải nối + cụm; `phan_tach_nghi` tách chờ | Xong |
| 3 | `/lich` trả ngày đặc biệt (ngày, loại, tên) + ca xưởng; endpoint vật tư theo lô | Xong |
| 4 | Schema + type TS (đi hết dây, xem bẫy Pydantic nuốt field) | Xong |
| 5 | FE đầu màn: nút khoảng ngày + lịch hai tháng, Hôm nay, Tìm, Lọc, Hiển thị (Gọn/Thoáng), nút khay; hàng tóm tắt + lọc nhanh | Xong |
| 6 | FE lưới: trục có tô nghỉ tuần / lễ (tên) / làm bù, tên + "Xong" trên thanh, hạn hình thoi, đoạn chờ, hàng tiêu đề cụm, đường nối, thẻ xem nhanh, kéo ghi giờ hai đầu | Xong |
| 7 | FE khay chờ xếp bên phải | Xong |
| 8 | FE băng Hoàn tác + Ctrl Z | Xong |
| 9 | FE ngăn chi tiết 1180px (mục 7) | Xong |
| 10 | Test BE nhắm file + `npx tsc`, bấm thử luồng thật trên dev-browser, commit | Xong 08/10: 101 test BE, tsc, vitest; bấm thử trên DB demo riêng (cổng 8010/5174). Chưa thử được cụm lệnh nối nhau vì seed demo không có cụm |
