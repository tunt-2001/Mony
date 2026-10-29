import { useEffect, useState } from 'react';
import { supabase, type Transaction } from '../lib/supabase';
import { formatVnd, shortDay, dayKey, sourceLabel, timeLabel, TZ } from '../lib/format';

interface Props {
  tx: Transaction;
  transfers: Map<string, string | null>;
  onClose: () => void;
  /** After a delete or a transfer toggle: the list must reload. */
  onChanged: () => void;
}

const fullTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso));

/** Bottom sheet with one transaction in full, including the original SMS. */
export function TxDetail({ tx, transfers, onClose, onChanged }: Props) {
  const [sms, setSms] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [partner, setPartner] = useState<Transaction | null>(null);
  const isTransfer = transfers.has(tx.id);
  const partnerId = transfers.get(tx.id) ?? null;

  useEffect(() => {
    if (!partnerId) return;
    supabase
      .from('transactions')
      .select('*')
      .eq('id', partnerId)
      .maybeSingle()
      .then(({ data }) => setPartner(data as Transaction | null));
  }, [partnerId]);

  useEffect(() => {
    if (!tx.raw_message_id) return;
    supabase
      .from('raw_messages')
      .select('body')
      .eq('id', tx.raw_message_id)
      .maybeSingle()
      .then(({ data }) => {
        setSms(data?.body ?? null);
        setLoaded(true);
      });
  }, [tx.raw_message_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function remove() {
    if (!confirm(`Xóa giao dịch ${formatVnd(tx.amount)}?`)) return;
    await supabase.from('transactions').delete().eq('id', tx.id);
    onChanged();
  }

  async function setTransfer(on: boolean) {
    // Unmarking an automatic pair must unmark both halves, or the other one stays excluded alone.
    const ids = on ? [tx.id] : [tx.id, ...(partnerId ? [partnerId] : [])];
    await supabase.from('transactions').update({ transfer: on }).in('id', ids);
    onChanged();
  }

  const kind = tx.amount > 0 ? 'in' : 'out';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <span className={`tag ${isTransfer ? 'transfer' : kind}`}>
            {isTransfer ? 'Chuyển nội bộ' : kind === 'in' ? 'Tiền nhận' : 'Tiền chi'}
          </span>
          <button className="link" onClick={onClose}>
            Đóng
          </button>
        </header>
        <p className={`detail-amount num ${kind}`}>
          {kind === 'in' ? '+' : '−'}
          {formatVnd(Math.abs(tx.amount))}
        </p>
        <dl className="detail">
          <dt>Thời gian</dt>
          <dd>{fullTime(tx.occurred_at)}</dd>
          <dt>Nguồn</dt>
          <dd>{sourceLabel(tx)}</dd>
          {tx.account && (
            <>
              <dt>Tài khoản</dt>
              <dd>{tx.account}</dd>
            </>
          )}
          {tx.balance !== null && (
            <>
              <dt>Số dư sau GD</dt>
              <dd className="num">{formatVnd(tx.balance)}</dd>
            </>
          )}
          <dt>Nội dung</dt>
          <dd>{tx.description || '(không có nội dung)'}</dd>
        </dl>
        <div className={`transfer-box${isTransfer ? ' on' : ''}`}>
          {isTransfer ? (
            <>
              <p>
                Chuyển giữa các tài khoản của bạn nên <b>không tính</b> vào nhận/chi.
                {partner && (
                  <>
                    {' '}
                    Khớp với {partner.amount > 0 ? '+' : '−'}
                    {formatVnd(Math.abs(partner.amount))} ở {sourceLabel(partner)} {partner.account ?? ''} lúc{' '}
                    {timeLabel(partner.occurred_at)} {shortDay(dayKey(partner.occurred_at), false)}.
                  </>
                )}
              </p>
              <button className="link" onClick={() => setTransfer(false)}>
                Không phải chuyển nội bộ
              </button>
            </>
          ) : (
            <>
              <p>Đây là tiền chuyển qua lại giữa các tài khoản của bạn?</p>
              <button className="link" onClick={() => setTransfer(true)}>
                Đánh dấu chuyển nội bộ
              </button>
            </>
          )}
        </div>
        {tx.raw_message_id && (
          <>
            <p className="section-label">Tin nhắn gốc</p>
            <pre className="sms">{sms ?? (loaded ? 'Không tìm thấy tin nhắn gốc' : 'Đang tải…')}</pre>
          </>
        )}
        <button className="danger-btn" onClick={remove}>
          Xóa giao dịch
        </button>
      </div>
    </div>
  );
}
