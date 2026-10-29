# Chi tiêu — app quản lý chi tiêu cá nhân

Tự ghi nhận giao dịch từ SMS biến động số dư BIDV / Techcombank, thống kê theo tháng.

```
SMS ngân hàng ──► Phím tắt iOS (Tự động hóa) ──► Supabase Edge Function "ingest-sms"
                                                   │ đọc SMS, tự phân loại
                                                   ▼
                                     Postgres (Supabase) ◄── Web app (PWA trên màn hình chính)
```

| Thư mục | Nội dung |
|---|---|
| `supabase/functions/_shared/smsParser.ts` | Đọc SMS → số tiền, số dư, thời gian, nội dung |
| `supabase/functions/_shared/categorize.ts` | Danh mục + quy tắc tự phân loại |
| `supabase/functions/ingest-sms/` | Endpoint nhận SMS từ Phím tắt |
| `supabase/migrations/0001_init.sql` | Bảng dữ liệu + Row Level Security |
| `supabase/migrations/0002_ingest_tokens.sql` | Mã kết nối cho từng điện thoại, từng người (chỉ lưu SHA-256) |
| `src/` | Web app React (Tổng quan, Giao dịch, Cài đặt) |
| `tests/` | Test cho bộ đọc SMS |

Mọi thứ chạy trên gói miễn phí, làm hoàn toàn trên Windows, không cần Mac.

---

## 1. Tạo Supabase

1. Đăng ký tại https://supabase.com → **New project**. Chọn region **Singapore**.
2. **SQL Editor** → lần lượt dán và **Run** `supabase/migrations/0001_init.sql`, rồi `0002_ingest_tokens.sql`.
3. **Authentication → Users → Add user → Create new user**: nhập email + mật khẩu, tích **Auto Confirm User** → **Create user**. Mỗi người trong nhà một tài khoản.
4. **Authentication → Sign In / Providers**: tắt **Allow new users to sign up** → **Save**, để không ai khác tạo được tài khoản.
5. **Project Settings → API**: copy `Project URL` và `anon public key`.

## 2. Chạy web app

```bash
npm install
```

Tạo file `.env` từ `.env.example`, điền 2 giá trị ở bước 1.5, rồi chạy:

```bash
npm run dev
```

Mở http://localhost:5173 và đăng nhập bằng email + mật khẩu đã tạo ở bước 1.3.

## 3. Deploy endpoint nhận SMS

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <project-ref>
```

```bash
npx supabase functions deploy ingest-sms --no-verify-jwt
```

`<project-ref>` là phần `xxxx` trong `https://xxxx.supabase.co`. Function không cần secret nào: nó tìm người dùng theo mã kết nối (`x-ingest-token`) trong bảng `ingest_tokens`.

Lấy mã kết nối: đăng nhập app → ⚙ **Cài đặt** → **Thêm điện thoại** → **Tạo mã kết nối**. Mã chỉ hiện một lần.

Thử endpoint bằng một SMS giả:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/ingest-sms -H "x-ingest-token: <token>" -H "content-type: application/json" -d "{\"body\":\"TK 1201xxx789 tai BIDV -45,000VND vao 07:05 29/10/2026. So du:1,000,000VND. ND: test\"}"
```

Kết quả mong đợi là `{"status":"parsed",...}`, và giao dịch hiện trong app.

## 4. Đưa app lên mạng và cài lên iPhone

1. Tạo tài khoản miễn phí tại https://dash.cloudflare.com/sign-up, rồi đăng nhập CLI (mở trình duyệt):

   ```bash
   npx wrangler login
   ```

2. Tạo project (chỉ làm một lần):

   ```bash
   npx wrangler pages project create chi-tieu --production-branch main
   ```

3. Build và đưa lên mạng (chạy lại mỗi khi sửa code). Lệnh này build bằng file `.env` trên máy và in ra link dạng `https://chi-tieu-xxx.pages.dev`:

   ```bash
   npm run deploy
   ```

4. Trên iPhone, mở link `https://chi-tieu-xxx.pages.dev` bằng **Safari** (không dùng Chrome) → nút **Chia sẻ** → **Thêm vào MH chính**.
5. Mở app từ màn hình chính và đăng nhập một lần (PWA có phiên đăng nhập riêng, tách với Safari). iPhone sẽ đề nghị lưu mật khẩu vào Keychain.

## 5. Tạo Tự động hóa trên iPhone

App **Phím tắt** → tab **Tự động hóa** → **+** → **Tin nhắn**:

- **Tin nhắn chứa**: một từ chỉ có trong SMS biến động số dư, ví dụ `So du`. Không nên dùng `BIDV`, vì tin OTP cũng chứa chữ này. Nếu hai ngân hàng dùng từ khác nhau, tạo hai tự động hóa.
- Chọn **Chạy ngay lập tức**, tắt **Thông báo khi chạy**.
- Thêm tác vụ **Nhận nội dung của URL**:
  - URL: `https://<project-ref>.supabase.co/functions/v1/ingest-sms`
  - Phương thức: **POST**
  - Đầu đề: `x-ingest-token` = `<token>`
  - Phần thân yêu cầu: **JSON**, gồm các trường:
    - `body` (Văn bản) = biến **Đầu vào phím tắt** → chạm vào biến, chọn **Nội dung**
    - `receivedAt` (Văn bản) = **Ngày hiện tại**, định dạng **ISO 8601** (không bắt buộc)

Kiểm tra: chờ một giao dịch thật, rồi mở app. Giao dịch sẽ có trong tab **Giao dịch**, và trong ⚙ **Cài đặt** dòng của điện thoại đó hiện "Nhận SMS lần cuối…".

**Android:** dùng app MacroDroid (trigger SMS nhận được chứa `So du` → HTTP Request POST, header `x-ingest-token`, body `text/plain` = `[sms_message]`). Các bước chi tiết hiện ngay trong app khi tạo mã kết nối cho Android.

> Nếu điện thoại mất mạng đúng lúc nhận SMS, giao dịch đó sẽ không được gửi lên server. Hãy đối chiếu với app ngân hàng; giao dịch bị thiếu thì thêm bằng nút **+ Thêm**.

## 6. Thêm mẫu SMS thật (quan trọng)

Các mẫu trong `tests/smsParser.test.ts` là **mẫu giả định**. Hãy copy vài SMS thật của BIDV và Techcombank (che số tài khoản), thêm vào file test thành các case mới, rồi chạy:

```bash
npm test
```

Nếu có test fail, sửa regex trong `smsParser.ts` rồi deploy lại function (bước 3, lệnh cuối).

## Dùng hằng ngày

- Hàng chip trên cùng lọc theo thời gian (Hôm nay, 7 ngày, 30 ngày, Tháng này, Tháng trước, Năm nay, Tùy chọn từ–đến). Bộ lọc áp dụng cho cả 2 tab.
- **Tổng quan**: chênh lệch thu – chi, tổng nhận, tổng chi (so với kỳ trước cùng độ dài), biểu đồ nhận/chi theo ngày (hoặc theo tháng khi khoảng thời gian dài hơn 62 ngày), 5 khoản nhận và 5 khoản chi lớn nhất.
- **Giao dịch**: sổ 2 cột Nhận / Chi, nhóm theo ngày, có tìm kiếm theo nội dung và nút **+ Thêm** để nhập tay.
- Bấm vào bất kỳ giao dịch nào để xem chi tiết, tin nhắn SMS gốc và nút xóa.
- SMS mà bộ đọc không hiểu vẫn được lưu trong bảng `raw_messages` (status `failed`), nhưng app không hiển thị chúng.
