# Bước cuối đếm theo đơn vị tính của sản phẩm (11/10/2026)

## Chuyện gì đã xảy ra

LSX26-0003 (Sách A5 64 trang, 1.000 cuốn) gửi nhập kho thì bị chặn: "Không quy đổi được từ «tay
sách» sang «cuốn»". Danh mục khai "Bắt tay + vào keo" (CD-0012) và "Xén 3 mặt" (CD-0013) đều là
tay → tay. Lúc lập lệnh, mỗi bước chép nguyên đơn vị vào/ra từ danh mục, nên bước cuối của lệnh
cũng ra "tay". KCS cuối đếm 240 tay, kho thì nhận theo cuốn, và không có quy đổi chung nào giữa
tay với cuốn (số tay mỗi cuốn đi theo từng sách: 64 trang là 4 tay, 96 trang là 6 tay).

## Luật

1. **Bước cuối của lệnh chính ra chặng Thành phẩm.** Chặng Thành phẩm (mã `cai`) chính là đơn vị
   tính của sản phẩm trên lệnh (cuốn, hộp, cái…). Danh mục công đoạn khai gì cho đầu ra của bước ấy
   cũng không đổi được điều này. Số ra của bước cuối = số lượng đặt của lệnh.
   - "Bước cuối" = bước cuối cùng nằm trên dòng giấy, theo thứ tự công đoạn của lệnh.
   - **Lệnh đi kèm** (bìa, phụ bản… chạy xong thì nhập vào bước của lệnh khác) KHÔNG áp luật này:
     bước cuối của nó nhả bán thành phẩm cho lệnh chính, giữ đúng đơn vị danh mục (vd con). Nhận ra
     lệnh đi kèm bằng chính cạnh nối: bước cuối của nó là bước trước của một bước thuộc lệnh khác.
   - Bước cuối khai tay đơn vị tại lệnh (bước ngoài dòng giấy) thì không đụng.
2. **Các bước giữa vẫn theo danh mục** (tờ nguyên, tờ, con, tay).
3. **Chỗ đổi dạng nằm ở bước cuối**, hệ số lấy từ chính sản phẩm của lệnh (đã có sẵn trong engine,
   `_he_so_cau`): tay → thành phẩm = 1 ÷ số tay mỗi cuốn; tờ → thành phẩm = số con (cắt rời) hoặc
   1 ÷ số tay (sách); con → thành phẩm = số cái trên tờ ÷ số con. Ví dụ LSX26-0003: Xén 3 mặt vào
   4.000 tay, ra 1.000 cuốn.
4. **Kho không quy đổi chặng Thành phẩm.** Số KCS cuối ở chặng Thành phẩm đã là đơn vị của sản
   phẩm, hệ số sang đơn vị món = 1. Giao thẳng cho khách thì đổi từ đơn vị của lệnh sang đơn vị dòng
   đơn (trùng thì 1; dòng đơn bán theo kiện thì phải đổi được, không thì báo). Chặng khác vẫn đi
   đường quy đổi của món như cũ.
5. **Màn hình gọi chặng Thành phẩm bằng đơn vị của lệnh** ở những chỗ có lệnh trong tay (KCS, đóng
   lệnh): "1.000 cuốn", không phải "1.000 thành phẩm".

## Khi danh mục khai sai

Luật 1 là lưới đỡ, không thay việc sửa danh mục. Danh mục đúng của sách là "Bắt tay + vào keo"
tay → Thành phẩm, "Xén 3 mặt" Thành phẩm → Thành phẩm. Danh mục sai thì lệnh vẫn đúng đơn vị ở bước
cuối, nhưng phiếu tính giá (đi theo danh mục, không biết thành phần nào là chính) tra bậc bù hao của
bước cuối theo số tay thay vì số cuốn, nên số giấy hai bên có thể lệch vài tờ. Sửa danh mục là hết
lệch.

## Lệnh đã phát hành

Luật áp khi lệnh được tính lại (lập lệnh, lưu công đoạn). Lệnh đã phát hành giữ số đã chụp; lệnh
nào đã ghi sản lượng theo tay ở bước cuối (LSX26-0003 trên DB dev) phải sửa dữ liệu riêng hoặc làm
lại lệnh.
