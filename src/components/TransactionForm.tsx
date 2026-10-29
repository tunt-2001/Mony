import { useState, type FormEvent } from 'react';
import { categorize } from '../../supabase/functions/_shared/categorize.ts';
import { forgetCustomCategories } from '../lib/categories';
import { CategoryPicker } from './CategoryPicker';
import { supabase } from '../lib/supabase';
import { fromLocalInput, toLocalInput } from '../lib/format';

/** Prefill, e.g. when filling a balance gap: the entry then belongs to that account's chain. */
export interface FormPreset {
  amount: number; // signed
  when: string; // ISO
  description: string;
  bank: string;
  account: string;
}

interface Props {
  preset?: FormPreset;
  onDone: (saved: boolean) => void;
}

/** Manual entry, e.g. for cash or an SMS that never arrived. */
export function TransactionForm({ preset, onDone }: Props) {
  const [kind, setKind] = useState<'out' | 'in'>(preset && preset.amount > 0 ? 'in' : 'out');
  const [amount, setAmount] = useState(preset ? Math.abs(preset.amount).toLocaleString('vi-VN') : '');
  const [description, setDescription] = useState(preset?.description ?? '');
  // Guessed from the description until the user picks one.
  const [picked, setPicked] = useState<string | null>(null);
  const sign = kind === 'out' ? -1 : 1;
  const category = picked ?? categorize(description, sign);
  const [when, setWhen] = useState(toLocalInput(preset?.when ?? new Date().toISOString()));
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
      category,
      source: 'manual',
      ...(preset && { bank: preset.bank, account: preset.account }),
    });
    if (error) return setError(error.message);
    forgetCustomCategories();
    onDone(true);
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="segmented">
        <button type="button" className={kind === 'out' ? 'active out' : ''} onClick={() => {
            setKind('out');
            setPicked(null);
          }}>
          Tiền chi
        </button>
        <button type="button" className={kind === 'in' ? 'active in' : ''} onClick={() => {
            setKind('in');
            setPicked(null);
          }}>
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
      <div className="field">
        <span className="field-label">Danh mục</span>
        {/* Remount on kind change: the two lists differ. */}
        <CategoryPicker key={kind} amount={sign} value={category} onChange={setPicked} />
      </div>
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
