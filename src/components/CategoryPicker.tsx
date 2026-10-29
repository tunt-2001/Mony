import { useEffect, useState } from 'react';
import { baseCategories, customCategories, fallbackCategory } from '../lib/categories';

interface Props {
  amount: number; // only its sign matters: money out and money in have different lists
  value: string;
  onChange: (category: string) => void;
}

/** Category chips; the last one, "Khác", opens a text field for a name of your own. */
export function CategoryPicker({ amount, value, onChange }: Props) {
  const [custom, setCustom] = useState<string[]>([]);
  const options = [...baseCategories(amount), ...custom];
  const fallback = fallbackCategory(amount);
  const inList = options.includes(value);
  const [other, setOther] = useState(!inList);
  const [text, setText] = useState(inList || value === fallback ? '' : value);
  // Focus (and pop the keyboard) only when the user taps "Khác…", not when a sheet opens on it.
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    customCategories().then((c) => setCustom(amount > 0 ? c.in : c.out));
  }, [amount]);

  // Value set from outside (a guess from the description) or a typed name that now has its own chip.
  useEffect(() => {
    if (options.includes(value)) {
      setOther(false);
      setText('');
    }
  }, [custom, value]);

  const commit = () => {
    const name = text.trim().replace(/\s+/g, ' ');
    const next = name || fallback;
    if (next !== value) onChange(next);
  };

  return (
    <div className="cat-picker">
      <div className="cat-chips" role="radiogroup" aria-label="Danh mục">
        {options.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={!other && value === c}
            className={`cat-chip${!other && value === c ? ' active' : ''}`}
            onClick={() => {
              setOther(false);
              if (c !== value) onChange(c);
            }}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={other}
          className={`cat-chip${other ? ' active' : ''}`}
          onClick={() => {
            setOther(true);
            setFocus(true);
          }}
        >
          Khác…
        </button>
      </div>
      {other && (
        <input
          className="cat-input"
          value={text}
          autoFocus={focus}
          maxLength={40}
          placeholder="Nhập tên danh mục, để trống = Khác"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      )}
    </div>
  );
}
