import { useId } from 'react';
import type { IsoDate } from '../../core/types';
import { dayName, shiftIso } from '../dates';

interface Props {
  date: IsoDate;
  today: IsoDate;
  onChange: (date: IsoDate) => void;
}

export function DayNav({ date, today, onChange }: Props) {
  const id = useId();
  // A food diary records what was eaten, so there is nothing to record forward
  // of today. Both the arrow and the date field enforce it — the field needs
  // its own `max` because a typed date never passes through the arrow.
  const atToday = date >= today;

  return (
    <div className="daynav">
      <button
        type="button"
        className="btn btn--secondary daynav__step"
        aria-label="Previous day"
        onClick={() => onChange(shiftIso(date, -1))}
      >
        ←
      </button>

      <span className="daynav__name" data-testid="day-name">{dayName(date, today)}</span>

      <button
        type="button"
        className="btn btn--secondary daynav__step"
        aria-label="Next day"
        disabled={atToday}
        onClick={() => onChange(shiftIso(date, 1))}
      >
        →
      </button>

      <div className="daynav__jump">
        <label htmlFor={id}>Jump to a date</label>
        <input
          id={id}
          type="date"
          value={date}
          max={today}
          onChange={(e) => { if (e.target.value !== '') onChange(e.target.value); }}
        />
      </div>
    </div>
  );
}
