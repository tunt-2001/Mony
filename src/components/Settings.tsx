import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { shortDay, dayKey, timeLabel } from '../lib/format';
import { IconLogout } from './Icons';
import { disablePush, enablePush, pushDiagnostics, pushSupport, sendTestPush } from '../lib/push';
import {
  DEFAULT_SETTINGS,
  loadDevices,
  loadSettingsData,
  saveSettings,
  type Device,
  type SettingsData,
  type UserSettings,
} from '../lib/userSettings';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-sms`;

type Platform = 'ios' | 'android';

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

/**
 * Account, limit, notifications, and the phones allowed to forward this member's SMS.
 * `initial` is prefetched by the app so the sheet opens complete; it is null only if opened before that finished.
 */
export function Settings({ initial, onClose }: { initial: SettingsData | null; onClose: () => void }) {
  const [email, setEmail] = useState(initial?.email ?? '');
  const [devices, setDevices] = useState<Device[] | null>(initial?.devices ?? null);
  const [label, setLabel] = useState('');
  const [platform, setPlatform] = useState<Platform>('ios');
  const [created, setCreated] = useState<NewToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UserSettings | null>(initial?.prefs ?? null);
  const [pushOn, setPushOn] = useState(initial?.pushOn ?? false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    loadSettingsData().then((d) => {
      setEmail(d.email);
      setDevices(d.devices);
      setPrefs(d.prefs);
      setPushOn(d.pushOn);
    });
  }, [initial]);

  const load = () => loadDevices().then(setDevices);

  async function update(patch: Partial<UserSettings>) {
    const next = { ...(prefs ?? DEFAULT_SETTINGS), ...patch };
    setPrefs(next);
    const err = await saveSettings(next);
    setSaved(err ?? 'Đã lưu');
    setTimeout(() => setSaved(null), 1500);
  }

  async function signOut() {
    if (!confirm('Đăng xuất?')) return;
    // Otherwise this phone would keep getting the previous member's notifications.
    await disablePush().catch(() => {});
    await supabase.auth.signOut();
  }

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
            <button className="link danger-link" onClick={signOut}>
              <IconLogout size={16} /> Đăng xuất
            </button>
          </div>
        </section>

        {prefs && (
          <section className="settings-block">
            <p className="section-label">
              Hạn mức chi tháng {saved && <span className="saved">· {saved}</span>}
            </p>
            <MoneyInput
              label="Số tiền tối đa mỗi tháng"
              value={prefs.monthly_limit}
              placeholder="Không đặt hạn mức"
              onCommit={(v) => update({ monthly_limit: v })}
            />
            <p className="muted small">
              Để trống nếu không muốn đặt hạn mức: khi đó app không hiện thanh hạn mức và không cảnh báo gì. Chuyển khoản giữa
              các tài khoản của bạn không bị tính.
            </p>
          </section>
        )}

        {prefs && <PushSettings prefs={prefs} enabled={pushOn} setEnabled={setPushOn} onChange={update} />}

        <section className="settings-block">
          <p className="section-label">Điện thoại gửi SMS</p>
          {devices === null ? (
            <p className="muted small">Đang tải…</p>
          ) : devices.length === 0 ? (
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

/** Amount field that saves when the user leaves it; empty means "not set". */
function MoneyInput(props: {
  label: string;
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
}) {
  const fmt = (v: number | null) => (v ? v.toLocaleString('vi-VN') : '');
  const [text, setText] = useState(fmt(props.value));
  return (
    <label>
      {props.label}
      <span className="money-input">
        <input
          inputMode="numeric"
          value={text}
          placeholder={props.placeholder}
          onChange={(e) => {
            const digits = e.target.value.replace(/D/g, '');
            setText(digits ? Number(digits).toLocaleString('vi-VN') : '');
          }}
          onBlur={() => {
            const v = Number(text.replace(/D/g, '')) || null;
            if (v !== props.value) props.onCommit(v);
          }}
        />
        <span>₫</span>
      </span>
    </label>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`toggle-row${props.disabled ? ' disabled' : ''}`}>
      <span>
        {props.label}
        {props.hint && <small className="muted">{props.hint}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

/** "Do you want push notifications": per device on/off, then which alerts (shared by all the member's devices). */
function PushSettings(props: {
  prefs: UserSettings;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  onChange: (p: Partial<UserSettings>) => void;
}) {
  const { prefs, enabled, setEnabled, onChange } = props;
  const support = pushSupport();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(on: boolean) {
    setBusy(true);
    setMessage(null);
    if (on) {
      const err = await enablePush().catch((e: Error) => e.message);
      if (err) setMessage(err);
      setEnabled(!err);
    } else {
      await disablePush();
      setEnabled(false);
    }
    setBusy(false);
  }

  return (
    <section className="settings-block">
      <p className="section-label">Thông báo đẩy</p>
      {support === 'needs-home-screen' && (
        <div className="warn">
          <p>
            App đang chạy như một trang web trong Safari nên iPhone chưa cho bật thông báo. Cài lại thành ứng dụng:
          </p>
          <ol className="steps">
            <li>Xóa biểu tượng app hiện tại trên màn hình chính.</li>
            <li>
              Mở <b>quanly-chitieu.pages.dev</b> bằng <b>Safari</b> → nút <b>Chia sẻ</b> → <b>Thêm vào MH chính</b>.
            </li>
            <li>
              Bật <b>Mở dưới dạng ứng dụng web</b> (Open as Web App) → <b>Thêm</b>.
            </li>
            <li>Mở app từ biểu tượng mới, đăng nhập lại rồi vào đây bật thông báo.</li>
          </ol>
        </div>
      )}
      {support === 'unsupported' && <p className="muted small">Máy hoặc trình duyệt này chưa bật được thông báo đẩy.</p>}
      {support !== 'ok' && <p className="muted small diag">{pushDiagnostics()}</p>}
      {support === 'ok' && (
        <>
          <div className="toggle-list">
            <Toggle label="Nhận thông báo trên máy này" checked={enabled} disabled={busy} onChange={toggle} />
          </div>
          {message && <p className="login-error">{message}</p>}
          {enabled && (
            <>
              <div className="toggle-list">
                <Toggle
                  label="Khi chi tới 80% và khi vượt hạn mức"
                  hint={prefs.monthly_limit ? undefined : 'Cần đặt hạn mức chi tháng ở trên'}
                  checked={!!prefs.monthly_limit && prefs.notify_limit}
                  disabled={!prefs.monthly_limit}
                  onChange={(v) => onChange({ notify_limit: v })}
                />
                <Toggle
                  label="Khi có thể thiếu giao dịch"
                  hint="Số dư trong SMS không khớp"
                  checked={prefs.notify_gaps}
                  onChange={(v) => onChange({ notify_gaps: v })}
                />
                <Toggle
                  label="Tóm tắt tuần"
                  hint="20:00 tối Chủ nhật"
                  checked={prefs.notify_weekly}
                  onChange={(v) => onChange({ notify_weekly: v })}
                />
              </div>
              <MoneyInput
                label="Báo khi có khoản chi từ"
                value={prefs.big_spend_threshold}
                placeholder="Không báo khoản chi lớn"
                onCommit={(v) => onChange({ big_spend_threshold: v })}
              />
              <div className="row">
                <button onClick={async () => setMessage(await sendTestPush())}>Gửi thử</button>
              </div>
              <p className="muted small">Các lựa chọn trên áp dụng cho mọi máy bạn đã bật thông báo.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
