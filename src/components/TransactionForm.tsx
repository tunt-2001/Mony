import { useState, type FormEvent } from 'react';
import { categorize } from '../../supabase/functions/_shared/categorize.ts';
import { supabase } from '../lib/supabase';
import { fromLocalInput, toLocalInput } from '../lib/format';

interface Props {
  onDone: (saved: boolean) => void;
}

/** Manual entry, e.g. for cash or an SMS that never arrived. */
export function TransactionForm({ onDone }: Props) {
  const [kind, setKind] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState(toLocalInput(new Date().toISOString()));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/\D/g, ''));
    if (!value) return setError('Nhập số tiền');
    const signed = kind === 'out' ? -value : value;

    const { error } = await supabase.from('transactions').insert({
      occurred_at: fromLocalInput(when),
      amount: signed,
      description: description.trim(),
      // The column is still required; the UI no longer shows categories.
      category: categorize(description, signed),
      source: 'manual',
    });
    if (error) return setError(error.message);
    onDone(true);
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="segmented">
        <button type="button" className={kind === 'out' ? 'active out' : ''} onClick={() => setKind('out')}>
          Tiền chi
        </button>
        <button type="button" className={kind === 'in' ? 'active in' : ''} onClick={() => setKind('in')}>
          Tiền nhận
        </button>
      </div>
      <label>
        Số tiền (₫)
        <input
          inputMode="numeric"
          required
          value={amount}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            setAmount(digits ? Number(digits).toLocaleString('vi-VN') : '');
          }}
        />
      </label>
      <label>
        Nội dung
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Thời gian
        <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" onClick={() => onDone(false)}>
          Hủy
        </button>
        <button className="primary">Lưu</button>
      </div>
    </form>
  );
}
