import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchField } from '../../data/repository';
import { IconSearch } from './Icons';

const FIELDS: { id: SearchField; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'tune', label: '词牌' },
  { id: 'author', label: '作者' },
  { id: 'poem', label: '词作' },
];

interface Props {
  initialText?: string;
  initialField?: SearchField;
  /** 受控模式：提供时不跳转，直接回调 */
  onSearch?: (text: string, field: SearchField) => void;
  size?: 'lg' | 'md';
  placeholder?: string;
}

export function SearchBox({ initialText = '', initialField = 'all', onSearch, size = 'md', placeholder }: Props) {
  const [text, setText] = useState(initialText);
  const [field, setField] = useState<SearchField>(initialField);
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (onSearch) return onSearch(text.trim(), field);
    const q = new URLSearchParams();
    if (text.trim()) q.set('q', text.trim());
    if (field !== 'all') q.set('field', field);
    navigate(`/library${q.toString() ? `?${q}` : ''}`);
  };

  return (
    <form className={`searchbox searchbox-${size}`} onSubmit={submit} role="search">
      <div className="searchbox-fields" role="radiogroup" aria-label="检索范围">
        {FIELDS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={field === f.id}
            className={field === f.id ? 'is-on' : ''}
            onClick={() => {
              setField(f.id);
              if (onSearch) onSearch(text.trim(), f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="searchbox-row">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? '如梦令、李清照、明月几时有……'}
          aria-label="检索词牌、作者或词作"
        />
        <button type="submit" className="searchbox-go" aria-label="检索">
          <IconSearch />
          <span>检索</span>
        </button>
      </div>
    </form>
  );
}
