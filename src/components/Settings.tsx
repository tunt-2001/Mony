import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { shortDay, dayKey, timeLabel } from '../lib/format';
import { IconLogout } from './Icons';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-sms`;

type Platform = 'ios' | 'android';

interface Device {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

interface NewToken {
  label: string;
  platform: Platform;
  token: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const when = (iso: string) => `${shortDay(dayKey(iso))} ${timeLabel(iso)}`;

/** Account, and the phones allowed to forward this member's SMS. */
export function Settings({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [label, setLabel] = useState('');
  const [platform, setPlatform] = useState<Platform>('ios');
  const [created, setCreated] = useState<NewToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('ingest_tokens')
      .select('id, label, created_at, last_used_at')
      .order('created_at', { ascending: false });
    setDevices((data ?? []) as Device[]);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
    load();
  }, [load]);

  async function createToken() {
    const name = label.trim() || (platform === 'ios' ? 'iPhone' : 'Android');
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase.from('ingest_tokens').insert({ label: name, token_hash: await sha256Hex(token) });
    if (error) return setError(error.message);
    setError(null);
    setCreated({ label: name, platform, token });
    setLabel('');
    load();
  }

  async function revoke(d: Device) {
    if (!confirm(`Thu hồi "${d.label}"? Thiết bị này sẽ không gửi SMS vào app được nữa.`)) return;
    await supabase.from('ingest_tokens').delete().eq('id', d.id);
    load();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet settings" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <h2>Cài đặt</h2>
          <button className="link" onClick={onClose}>
            Đóng
          </button>
        </header>

        <section className="settings-block">
          <p className="section-label">Tài khoản</p>
          <div className="settings-row">
            <span className="ellipsis">{email}</span>
            <button className="link danger-link" onClick={() => confirm('Đăng xuất?') && supabase.auth.signOut()}>
              <IconLogout size={16} /> Đăng xuất
            </button>
          </div>
        </section>

        <section className="settings-block">
          <p className="section-label">Điện thoại gửi SMS</p>
          {devices.length === 0 ? (
            <p className="muted small">Chưa có. Thêm điện thoại bên dưới để SMS tự vào app.</p>
          ) : (
            <ul className="device-list">
              {devices.map((d) => (
                <li key={d.id}>
                  <span className="device-text">
                    <strong className="ellipsis">{d.label}</strong>
                    <small className="muted">
                      {d.last_used_at ? `Nhận SMS lần cuối ${when(d.last_used_at)}` : 'Chưa nhận SMS nào'}
                    </small>
                  </span>
                  <button className="link danger-link" onClick={() => revoke(d)}>
                    Thu hồi
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {created ? (
          <TokenSetup created={created} onDone={() => setCreated(null)} />
        ) : (
          <section className="settings-block">
            <p className="section-label">Thêm điện thoại</p>
            <div className="segmented">
              <button className={platform === 'ios' ? 'active' : ''} onClick={() => setPlatform('ios')}>
                iPhone
              </button>
              <button className={platform === 'android' ? 'active' : ''} onClick={() => setPlatform('android')}>
                Android
              </button>
            </div>
            <label>
              Tên gợi nhớ
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={platform === 'ios' ? 'VD: iPhone của mẹ' : 'VD: Samsung của bố'}
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            <button className="primary" onClick={createToken}>
              Tạo mã kết nối
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <span className="section-label">{label}</span>
      <div>
        <code>{value}</code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Đã chép' : 'Chép'}
        </button>
      </div>
    </div>
  );
}

/** Shown once, right after creation: only the hash is stored, so the token can't be displayed again. */
function TokenSetup({ created, onDone }: { created: NewToken; onDone: () => void }) {
  return (
    <section className="settings-block token-setup">
      <p className="section-label">Kết nối "{created.label}"</p>
      <p className="warn">Mã kết nối chỉ hiện một lần này. Làm xong các bước bên dưới rồi mới bấm Xong.</p>
      <CopyField label="Địa chỉ (URL)" value={ENDPOINT} />
      <CopyField label="Mã kết nối (token)" value={created.token} />

      {created.platform === 'ios' ? (
        <ol className="steps">
          <li>
            Mở app <b>Phím tắt</b> → tab <b>Tự động hóa</b> → <b>+</b> → <b>Tin nhắn</b>.
          </li>
          <li>
            <b>Tin nhắn chứa</b>: <code>So du</code> → chọn <b>Chạy ngay lập tức</b> → <b>Tiếp</b> → <b>Phím tắt trống mới</b>.
          </li>
          <li>
            Thêm tác vụ <b>Lấy nội dung của URL</b> (biểu tượng xanh lá), dán <b>Địa chỉ</b> vào ô URL.
          </li>
          <li>
            Mở thêm tùy chọn: <b>Phương thức</b> = POST. <b>Tiêu đề</b> → thêm <code>x-ingest-token</code> = dán{' '}
            <b>Mã kết nối</b>.
          </li>
          <li>
            <b>Yêu cầu nội dung</b> = JSON → thêm trường Văn bản <code>body</code> = <b>Đầu vào phím tắt</b> → bấm vào
            biến, chọn <b>Nội dung</b>.
          </li>
          <li>
            Bấm <b>✓</b> để lưu.
          </li>
        </ol>
      ) : (
        <ol className="steps">
          <li>
            Cài <b>MacroDroid</b> từ Google Play, mở app → <b>Thêm macro</b> (Add Macro).
          </li>
          <li>
            <b>Trình kích hoạt</b> (Triggers) → <b>Điện thoại / SMS</b> → <b>SMS nhận được</b> (SMS Received) → Bất kỳ số
            nào, nội dung <b>chứa</b> <code>So du</code>. Cho phép quyền đọc SMS.
          </li>
          <li>
            <b>Hành động</b> (Actions) → <b>Web</b> → <b>Yêu cầu HTTP</b> (HTTP Request): phương thức <b>POST</b>, URL =
            dán <b>Địa chỉ</b>.
          </li>
          <li>
            Mục <b>Tiêu đề</b> (Headers): thêm <code>x-ingest-token</code> = dán <b>Mã kết nối</b>.
          </li>
          <li>
            Mục <b>Nội dung</b> (Body): loại <code>text/plain</code>, nội dung chọn thẻ <code>[sms_message]</code>{' '}
            (nội dung SMS).
          </li>
          <li>
            Đặt tên macro, bấm <b>✓</b> lưu. Trong cài đặt pin của Android, chọn <b>Không hạn chế</b> cho MacroDroid để
            nó chạy nền.
          </li>
        </ol>
      )}
      <p className="muted small">
        Kiểm tra: khi có biến động số dư, dòng của điện thoại này trong danh sách sẽ đổi thành "Nhận SMS lần cuối…".
      </p>
      <button className="primary" onClick={onDone}>
        Xong
      </button>
    </section>
  );
}
