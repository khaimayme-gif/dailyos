import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, Wallet, BadgeCheck, PartyPopper, Plane, Bell, Moon, Sun,
  Menu, X, Settings, ChevronRight, ChevronLeft, LogOut,
  Banknote, Landmark, TrendingUp, TrendingDown, Scale, Receipt, ListChecks,
  Plus, Pencil, Trash2, Check, CalendarDays, Fingerprint, Eye, EyeOff, ClipboardList, History,
  CreditCard, CalendarClock, QrCode, Download,
} from 'lucide-react';
import LoginGate, { SignOutButton, useCurrentUser } from './lib/LoginGate';
import { useSyncedCollection, useSyncedBalances } from './lib/sync';
import Logo from './lib/Logo';
import QRCode from 'qrcode';

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&family=Inter:wght@400;500;600&display=swap');";

const light = {
  bg: '#F5F4F0',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEDE5',
  textPrimary: '#20241F',
  textSecondary: '#6C7369',
  textFaint: '#9A9F94',
  border: '#E6E2D8',
  accent: '#2F6F62',
  accentSoft: '#E3EEEB',
  gold: '#B0813A',
  goldSoft: '#F4EBDA',
  safe: '#3F8F5F',
  safeSoft: '#E7F3EA',
  upcoming: '#B0813A',
  upcomingSoft: '#F4EBDA',
  urgent: '#C24A3B',
  urgentSoft: '#FBEAE6',
  actionNeeded: '#C97227',
  actionNeededSoft: '#FBEBDA',
  expired: '#6E7268',
  expiredSoft: '#EAE8E0',
  shadow: '0 1px 2px rgba(32,36,31,0.04), 0 8px 24px rgba(32,36,31,0.04)',
};

const dark = {
  bg: '#14181A',
  surface: '#1B2023',
  surfaceMuted: '#20262A',
  textPrimary: '#EDEEE9',
  textSecondary: '#9AA29B',
  textFaint: '#6C7570',
  border: '#2A3134',
  accent: '#59B09C',
  accentSoft: '#1F3733',
  gold: '#D9A75A',
  goldSoft: '#332A18',
  safe: '#5FB27E',
  safeSoft: '#1B2E22',
  upcoming: '#D9A75A',
  upcomingSoft: '#332A18',
  urgent: '#E0776A',
  urgentSoft: '#3A1E1A',
  actionNeeded: '#E0A15E',
  actionNeededSoft: '#3A2C18',
  expired: '#919991',
  expiredSoft: '#252A26',
  shadow: '0 1px 2px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.28)',
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'financial', label: 'Financial', icon: Wallet },
  { id: 'immigration', label: 'Immigration', icon: BadgeCheck },
  { id: 'occasions', label: 'Occasions', icon: PartyPopper },
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'qrcode', label: 'QR Code', icon: QrCode },
];

const PLACEHOLDER_COPY = {
  occasions: {
    title: 'Occasions',
    desc: 'Never forget the important moments.',
    icon: PartyPopper,
  },
  trips: {
    title: 'Trips',
    desc: 'Plan your next adventure.',
    icon: Plane,
  },
};

/**
 * Builds real, live notifications from actual app data: upcoming/overdue
 * immigration dates (visa & passport expiry, 90-day reports) and upcoming
 * occasions (birthdays, anniversaries, classes, etc., including recurring
 * ones — only their next occurrence is shown, not every future instance).
 * Sorted soonest-first, capped to a reasonable count so the panel doesn't
 * flood with far-future items.
 */
function computeNotifications(immigration, occasions, now) {
  const todayStr = toDateStr(now);
  const horizon = 45; // days out we bother surfacing at all
  const items = [];

  function levelFor(daysUntil) {
    if (daysUntil <= 0) return 'urgent';
    if (daysUntil <= 14) return 'upcoming';
    return 'safe';
  }
  function relativeLabel(daysUntil) {
    if (daysUntil < 0) return `overdue by ${Math.abs(daysUntil)}d`;
    if (daysUntil === 0) return 'due today';
    return `in ${daysUntil}d`;
  }
  function personName(id) {
    return USERS.find((u) => u.id === id)?.name || id;
  }

  for (const v of immigration.visas || []) {
    if (!v.expirationDate) continue;
    const d = diffDays(v.expirationDate, now);
    if (d > horizon) continue;
    items.push({ id: `visa-${v.id}`, level: levelFor(d), daysUntil: d, text: `${personName(v.personId)}'s visa expires ${relativeLabel(d)}.` });
  }
  for (const p of immigration.passports || []) {
    if (!p.expirationDate) continue;
    const d = diffDays(p.expirationDate, now);
    if (d > horizon) continue;
    items.push({ id: `passport-${p.id}`, level: levelFor(d), daysUntil: d, text: `${personName(p.personId)}'s passport expires ${relativeLabel(d)}.` });
  }
  for (const r of immigration.ninetyDayReports || []) {
    if (r.completed || !r.nextDueDate) continue;
    const d = diffDays(r.nextDueDate, now);
    if (d > horizon) continue;
    items.push({ id: `90day-${r.id}`, level: levelFor(d), daysUntil: d, text: `${personName(r.personId)}'s 90-day report is ${relativeLabel(d)}.` });
  }

  const horizonEnd = addDays(todayStr, horizon);
  for (const o of occasions || []) {
    const occurrences = occasionOccurrencesInRange(o, todayStr, horizonEnd);
    if (occurrences.length === 0) continue;
    // Only the soonest upcoming occurrence, so a recurring event doesn't spam multiple entries.
    const next = occurrences.reduce((a, b) => (a.date < b.date ? a : b));
    const d = diffDays(next.date, now);
    items.push({ id: `occasion-${o.id}-${next.date}`, level: levelFor(d), daysUntil: d, text: `${o.title} is ${relativeLabel(d)}.` });
  }

  items.sort((a, b) => a.daysUntil - b.daysUntil);
  return items.slice(0, 8);
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function DayRing({ now, colors }) {
  const pct = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const r = 30;
  const c = 2 * Math.PI * r;
  const isNight = now.getHours() < 6 || now.getHours() >= 19;
  return (
    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke={colors.border} strokeWidth="4" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={colors.accent} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: colors.accent,
      }}>
        {isNight ? <Moon size={20} /> : <Sun size={20} />}
      </div>
    </div>
  );
}

function HouseholdMark({ colors, size = 34 }) {
  const s = size;
  return (
    <div style={{ position: 'relative', width: s * 1.5, height: s, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, width: s, height: s, borderRadius: '50%',
        background: colors.accentSoft, color: colors.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: s * 0.38,
        border: `2px solid ${colors.surface}`,
      }}>A</div>
      <div style={{
        position: 'absolute', left: s * 0.5, top: 0, width: s, height: s, borderRadius: '50%',
        background: colors.goldSoft, color: colors.gold,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: s * 0.38,
        border: `2px solid ${colors.surface}`,
      }}>M</div>
    </div>
  );
}

function WelcomeScreen({ colors, dark: isDark, onEnter }) {
  return (
    <div style={{
      minHeight: '640px', width: '100%', background: colors.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden',
      padding: '24px',
    }}>
      <style>{`
        ${FONT_IMPORT}
        @keyframes orbit-a { from { transform: rotate(0deg) translateX(46px) rotate(0deg); } to { transform: rotate(360deg) translateX(46px) rotate(-360deg); } }
        @keyframes orbit-m { from { transform: rotate(180deg) translateX(46px) rotate(-180deg); } to { transform: rotate(540deg) translateX(46px) rotate(-540deg); } }
        @media (prefers-reduced-motion: reduce) {
          .orbit-a, .orbit-m { animation: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 140, height: 140, marginBottom: 40 }}>
          <div style={{
            position: 'absolute', left: '50%', top: '50%', width: 140, height: 140,
            marginLeft: -70, marginTop: -70, borderRadius: '50%',
            border: `1px dashed ${colors.border}`,
          }} />
          <div className="orbit-a" style={{
            position: 'absolute', left: '50%', top: '50%', width: 44, height: 44,
            marginLeft: -22, marginTop: -22, borderRadius: '50%',
            background: colors.accentSoft, color: colors.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 16, animation: 'orbit-a 16s linear infinite',
            boxShadow: colors.shadow,
          }}>A</div>
          <div className="orbit-m" style={{
            position: 'absolute', left: '50%', top: '50%', width: 44, height: 44,
            marginLeft: -22, marginTop: -22, borderRadius: '50%',
            background: colors.goldSoft, color: colors.gold,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 16, animation: 'orbit-m 16s linear infinite',
            boxShadow: colors.shadow,
          }}>M</div>
        </div>

        <Logo height={150} />
        <p style={{
          color: colors.textSecondary, fontSize: 15, marginTop: 10, marginBottom: 36,
          lineHeight: 1.5,
        }}>Your operating system for everyday life.</p>

        <button
          onClick={onEnter}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: colors.textPrimary, color: colors.bg,
            border: 'none', borderRadius: 999, padding: '13px 26px',
            fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
          }}
        >
          Enter DailyOS
          <ChevronRight size={16} />
        </button>
        <p style={{ color: colors.textFaint, fontSize: 12, marginTop: 18 }}>
          Shared privately by Alex &amp; Miki
        </p>
      </div>
    </div>
  );
}

function SidebarContent({ colors, page, setPage, dark: isDark, setDark, closeMobile }) {
  const { personName, email } = useCurrentUser();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '24px 20px 20px' }}>
        <Logo height={100} />
        <div style={{ color: colors.textFaint, fontSize: 12, marginTop: 4 }}>
          Run your day. Organize your life.
        </div>
      </div>

      <nav style={{ flex: 1, padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setPage(item.id); if (closeMobile) closeMobile(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10, border: 'none',
                background: active ? colors.accentSoft : 'transparent',
                color: active ? colors.accent : colors.textSecondary,
                fontSize: 14, fontWeight: active ? 600 : 500,
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '16px 20px 20px', borderTop: `1px solid ${colors.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <HouseholdMark colors={colors} size={30} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{personName}</div>
            <div style={{ fontSize: 11, color: colors.textFaint }}>{email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setDark(!isDark)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 0', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: colors.surface, color: colors.textSecondary,
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
            {isDark ? 'Light' : 'Dark'}
          </button>
          <button
            style={{
              width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 9, border: `1px solid ${colors.border}`,
              background: colors.surface, color: colors.textSecondary, cursor: 'pointer',
            }}
            aria-label="Settings"
          >
            <Settings size={15} />
          </button>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

function TopBar({ colors, title, onMenu, notifOpen, setNotifOpen, notifications }) {
  const unread = notifications.length;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px', borderBottom: `1px solid ${colors.border}`,
      fontFamily: 'Inter, sans-serif', position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onMenu}
          style={{
            display: 'none', border: 'none', background: 'transparent',
            color: colors.textPrimary, cursor: 'pointer', padding: 4,
          }}
          className="mobile-menu-btn"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>{title}</span>
      </div>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          style={{
            position: 'relative', border: `1px solid ${colors.border}`,
            background: colors.surface, borderRadius: 10, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: colors.textSecondary, cursor: 'pointer',
          }}
          aria-label="Notifications"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: 6, right: 7, width: 7, height: 7,
              borderRadius: '50%', background: colors.urgent,
              border: `1.5px solid ${colors.surface}`,
            }} />
          )}
        </button>

        {notifOpen && (
          <div style={{
            position: 'absolute', right: 0, top: 44, width: 280,
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: 12, boxShadow: colors.shadow, padding: 8, zIndex: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textFaint, padding: '6px 8px' }}>
              Notifications
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 12.5, color: colors.textFaint }}>
                Nothing needs your attention right now.
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  padding: '8px', borderRadius: 8,
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                    background: colors[n.level] || colors.accent,
                  }} />
                  <span style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 1.4 }}>{n.text}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderPage({ colors, page }) {
  const info = PLACEHOLDER_COPY[page];
  const Icon = info.icon;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 420, textAlign: 'center', padding: 40,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: colors.accentSoft,
        color: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
      }}>
        <Icon size={24} />
      </div>
      <h2 style={{
        fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: 22,
        color: colors.textPrimary, margin: '0 0 8px',
      }}>{info.title}</h2>
      <p style={{ color: colors.textSecondary, fontSize: 14, maxWidth: 280, lineHeight: 1.6, margin: 0 }}>
        {info.desc}
      </p>
      <span style={{
        marginTop: 20, fontSize: 12, fontWeight: 500, color: colors.textFaint,
        border: `1px solid ${colors.border}`, borderRadius: 999, padding: '6px 14px',
      }}>Coming soon</span>
    </div>
  );
}

const USERS = [
  { id: 'miki', name: 'Miki' },
  { id: 'alex', name: 'Alex' },
  { id: 'shared', name: 'Shared' },
];

const DEFAULT_CATEGORIES = [
  'Allowance for Parents', 'Groceries', 'Visa Fees', 'Car Maintenance',
  'Rental Bill', 'Electricity / Meter Bill', 'Water Bill', 'Internet',
  'Transportation', 'Dining', 'Shopping', 'Entertainment', 'Healthcare', 'Interest', 'Other',
].map((name, i) => ({ id: `cat_${i}`, name, active: true }));

const INCOME_TYPES = ['Salary', 'Business Income', 'Extra Money'];
const OBLIGATION_FREQUENCIES = ['One-time', 'Weekly', 'Monthly', 'Yearly'];
const DEBT_STATUSES = ['Active', 'Paid Off'];
const DEBT_TYPES = ['Short-term', 'Long-term'];
const PLANNED_DEBT_STATUSES = ['Planned', 'Paid', 'Cancelled'];
const PAYMENT_METHODS = ['Cash', 'Bank'];

const OCCASION_CATEGORIES = [
  { id: 'anniversary', label: 'Anniversary', tone: 'gold' },
  { id: 'birthday', label: 'Birthday', tone: 'upcoming' },
  { id: 'class', label: 'Class / Study', tone: 'accent' },
  { id: 'period', label: 'Period', tone: 'urgent' },
  { id: 'immigration', label: 'Immigration', tone: 'actionNeeded' },
  { id: 'other', label: 'Other', tone: 'expired' },
];
function occasionCategoryInfo(id) {
  return OCCASION_CATEGORIES.find((c) => c.id === id) || OCCASION_CATEGORIES[OCCASION_CATEGORIES.length - 1];
}
const OCCASION_RECURRENCES = ['None', 'Yearly', 'Monthly (same day)', 'Monthly (last day)'];
const RENEWAL_STATUSES = ['Not Started', 'Preparing', 'Documents Ready', 'Submitted', 'Completed'];
const DEFAULT_VISA_CHECKLIST = [
  'Passport checked', 'Required documents prepared', 'Photos prepared',
  'School/institution documents prepared', 'Appointment checked', 'Fees prepared', 'Renewal completed',
].map((title) => ({ id: genId(), title, completed: false }));

const FINANCIAL_TABS = [
  { id: 'overview', label: 'Overview', icon: Scale },
  { id: 'income', label: 'Income', icon: TrendingUp },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'obligations', label: 'Commitments', icon: ListChecks },
  { id: 'debt', label: 'Debt', icon: CreditCard },
];

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyOf(d);
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function daysInMonthOf(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function fmtCurrency(n) {
  const rounded = Math.round(n || 0);
  return `฿${rounded.toLocaleString('en-US')}`;
}
function inMonth(dateStr, key) {
  return dateStr && dateStr.slice(0, 7) === key;
}
function parseDateOnly(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function diffDays(dueDateStr, now) {
  const due = parseDateOnly(dueDateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}
function addDays(dateStr, n) {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function lastDayOfMonth(y, m) {
  return new Date(y, m, 0).getDate(); // m is 1-12, day 0 of next month = last day of this month
}
function clampDayToMonth(y, m, day) {
  return Math.min(day, lastDayOfMonth(y, m));
}
/**
 * Expands a single occasion (with optional recurrence) into every concrete
 * occurrence whose date range overlaps [rangeStart, rangeEnd] (inclusive
 * 'YYYY-MM-DD' strings). Each result is { date, endDate } using the same
 * span (in days) as the original occasion.
 */
function occasionOccurrencesInRange(o, rangeStart, rangeEnd) {
  const [sy, sm, sd] = o.startDate.split('-').map(Number);
  const spanDays = o.endDate ? Math.round((parseDateOnly(o.endDate) - parseDateOnly(o.startDate)) / 86400000) : 0;
  const rStart = parseDateOnly(rangeStart);
  const rEnd = parseDateOnly(rangeEnd);
  const skipDates = o.skipDates || [];
  const results = [];

  function tryAdd(dateStr) {
    if (skipDates.includes(dateStr)) return;
    const occStart = parseDateOnly(dateStr);
    const occEnd = new Date(occStart.getTime() + spanDays * 86400000);
    if (occEnd >= rStart && occStart <= rEnd) {
      results.push({ date: dateStr, endDate: spanDays > 0 ? addDays(dateStr, spanDays) : null });
    }
  }

  const recurrence = o.recurrence || 'None';

  if (recurrence === 'None') {
    tryAdd(o.startDate);
    return results;
  }

  if (recurrence === 'Yearly') {
    const y0 = Number(rangeStart.slice(0, 4));
    const y1 = Number(rangeEnd.slice(0, 4));
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      if (y < sy) continue;
      const day = clampDayToMonth(y, sm, sd);
      tryAdd(`${y}-${String(sm).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return results;
  }

  if (recurrence === 'Monthly (same day)' || recurrence === 'Monthly (last day)') {
    let y = rStart.getFullYear();
    let m = rStart.getMonth() + 1;
    // start one month early to catch multi-day spans that begin just before the range
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
    for (let i = 0; i < 40; i++) { // generous cap, well beyond any realistic visible range
      if (y > sy || (y === sy && m >= sm)) {
        const day = recurrence === 'Monthly (last day)' ? lastDayOfMonth(y, m) : clampDayToMonth(y, m, sd);
        tryAdd(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      if (y > Number(rangeEnd.slice(0, 4)) + 1) break;
    }
    return results;
  }

  return results;
}
/** Builds the 42 (6-week) grid of dates for a month view, including the
 * leading/trailing days from adjacent months needed to fill full weeks. */
function occasionsCalendarGridDays(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(y, m - 1, 1 - startWeekday);
  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return days;
}
/** Derives read-only "virtual" occasions from Visa/Passport/90-day-report
 * data, so important immigration dates show up on the calendar without
 * needing to be entered twice. These aren't stored in the occasions table
 * and can't be edited/deleted from the calendar. */
function deriveImmigrationOccasions(immigration) {
  const out = [];
  for (const v of immigration.visas || []) {
    if (!v.expirationDate) continue;
    out.push({
      id: `virtual-visa-${v.id}`, virtual: true, title: `${USERS.find((u) => u.id === v.personId)?.name || v.personId}'s visa expires`,
      category: 'immigration', personId: v.personId, startDate: v.expirationDate, endDate: null,
      startTime: null, endTime: null, location: '', recurrence: 'None', notes: '',
    });
  }
  for (const p of immigration.passports || []) {
    if (!p.expirationDate) continue;
    out.push({
      id: `virtual-passport-${p.id}`, virtual: true, title: `${USERS.find((u) => u.id === p.personId)?.name || p.personId}'s passport expires`,
      category: 'immigration', personId: p.personId, startDate: p.expirationDate, endDate: null,
      startTime: null, endTime: null, location: '', recurrence: 'None', notes: '',
    });
  }
  for (const r of immigration.ninetyDayReports || []) {
    if (r.completed || !r.nextDueDate) continue;
    out.push({
      id: `virtual-90day-${r.id}`, virtual: true, title: `${USERS.find((u) => u.id === r.personId)?.name || r.personId}'s 90-day report due`,
      category: 'immigration', personId: r.personId, startDate: r.nextDueDate, endDate: null,
      startTime: null, endTime: null, location: '', recurrence: 'None', notes: '',
    });
  }
  return out;
}
function dueDateForMonth(o, monthKey) {
  const [, , od] = o.dueDate.split('-').map(Number);
  const om = Number(o.dueDate.split('-')[1]);
  const [my, mm] = monthKey.split('-').map(Number);
  if (o.frequency === 'Monthly' || o.frequency === 'Weekly') {
    const dim = new Date(my, mm, 0).getDate();
    const day = Math.min(od, dim);
    return `${my}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (o.frequency === 'Yearly') {
    const dim = new Date(my, om, 0).getDate();
    const day = Math.min(od, dim);
    return `${my}-${String(om).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return o.dueDate;
}
function paymentScheduleLabel(o) {
  const [, m, d] = o.dueDate.split('-').map(Number);
  if (o.frequency === 'Monthly' || o.frequency === 'Weekly') return `Day ${d} of each month`;
  if (o.frequency === 'Yearly') {
    const monthName = new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'long' });
    return `${monthName} ${d} every year`;
  }
  return `One-time on ${o.dueDate}`;
}
function obligationAppliesToMonth(o, monthKey) {
  // The month the obligation's due date was originally set in — recurring
  // obligations shouldn't show up (or count toward totals) before this,
  // even though only the *day* matters once they're active.
  const startMonth = o.dueDate.slice(0, 7);
  if (o.frequency === 'Monthly' || o.frequency === 'Weekly') return monthKey >= startMonth;
  if (o.frequency === 'Yearly') {
    return o.dueDate.split('-')[1] === monthKey.split('-')[1] && monthKey >= startMonth;
  }
  return o.dueDate.slice(0, 7) === monthKey;
}
function obligationStatus(o, monthKey, now) {
  const dueDateStr = dueDateForMonth(o, monthKey);
  if (o.paidMonths && o.paidMonths.includes(monthKey)) {
    return { label: 'Paid', tone: 'safe', dueDateStr, daysUntil: null };
  }
  const daysUntil = diffDays(dueDateStr, now);
  let label, tone;
  if (daysUntil < 0) { label = 'Overdue'; tone = 'urgent'; }
  else if (daysUntil === 0) { label = 'Due today'; tone = 'urgent'; }
  else if (daysUntil <= 7) { label = 'Due soon'; tone = 'upcoming'; }
  else { label = 'Upcoming'; tone = 'safe'; }
  return { label, tone, dueDateStr, daysUntil };
}

// --- Debt helpers ---
// Interest schedule periods use 'YYYY-MM' strings for effectiveFrom/effectiveUntil,
// same format as monthKey, so lexicographic comparison is correct chronological order.
function currentInterestPeriod(schedule, monthKey) {
  if (!schedule || schedule.length === 0) return null;
  const eligible = schedule.filter(
    (p) => p.effectiveFrom <= monthKey && (!p.effectiveUntil || p.effectiveUntil >= monthKey)
  );
  if (eligible.length > 0) {
    return [...eligible].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  }
  const past = schedule.filter((p) => p.effectiveFrom <= monthKey)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  if (past.length > 0) return past[0];
  return [...schedule].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0] || null;
}
// Outstanding balance is always derived from starting balance minus recorded principal
// payments — never trusted as a manually-stored field — so edits/deletes to payment
// history stay consistent automatically (per the spec's data-integrity rules).
function debtOutstandingBalance(debt, debtPayments) {
  const principalPaid = debtPayments
    .filter((p) => p.debtId === debt.id)
    .reduce((s, p) => s + Number(p.principalAmount || 0), 0);
  const startingBalance = Number(debt.startingBalance ?? debt.originalAmount ?? 0);
  return Math.max(0, startingBalance - principalPaid);
}
function debtPaymentsForDebt(debtId, debtPayments) {
  return debtPayments.filter((p) => p.debtId === debtId);
}
function useDebtTotals({ debts, debtPayments, plannedDebtPayments, monthKey }) {
  return useMemo(() => {
    const activeDebts = debts.filter((d) => (d.status || 'Active') !== 'Paid Off');
    const totalOutstanding = debts.reduce((s, d) => s + debtOutstandingBalance(d, debtPayments), 0);
    const totalOriginal = debts.reduce((s, d) => s + Number(d.originalAmount || 0), 0);
    const shortTermOutstanding = debts
      .filter((d) => (d.debtType || 'Short-term') === 'Short-term')
      .reduce((s, d) => s + debtOutstandingBalance(d, debtPayments), 0);
    const longTermOutstanding = debts
      .filter((d) => d.debtType === 'Long-term')
      .reduce((s, d) => s + debtOutstandingBalance(d, debtPayments), 0);
    const monthlyInterestDue = activeDebts.reduce((s, d) => {
      const period = currentInterestPeriod(d.interestSchedule, monthKey);
      return s + Number(period?.monthlyInterestAmount || 0);
    }, 0);
    const monthPayments = debtPayments.filter((p) => inMonth(p.paymentDate, monthKey));
    const interestPaidThisMonth = monthPayments.reduce((s, p) => s + Number(p.interestAmount || 0), 0);
    const principalPaidThisMonth = monthPayments.reduce((s, p) => s + Number(p.principalAmount || 0), 0);
    const totalPaidThisMonth = interestPaidThisMonth + principalPaidThisMonth;
    const upcoming = plannedDebtPayments
      .filter((p) => p.status === 'Planned')
      .sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1));
    const nextPlanned = upcoming[0] || null;
    const percentPaid = totalOriginal > 0 ? ((totalOriginal - totalOutstanding) / totalOriginal) * 100 : 0;
    return {
      totalOutstanding, totalOriginal, monthlyInterestDue,
      shortTermOutstanding, longTermOutstanding,
      interestPaidThisMonth, principalPaidThisMonth, totalPaidThisMonth,
      nextPlanned, upcomingPlanned: upcoming, percentPaid,
    };
  }, [debts, debtPayments, plannedDebtPayments, monthKey]);
}

function visaStatus(expirationDate, now) {
  const daysLeft = diffDays(expirationDate, now);
  if (daysLeft < 0) return { label: 'Expired', tone: 'expired', daysLeft };
  if (daysLeft <= 7) return { label: 'Urgent', tone: 'urgent', daysLeft };
  if (daysLeft <= 30) return { label: 'Action Needed', tone: 'actionNeeded', daysLeft };
  if (daysLeft <= 90) return { label: 'Renewal Planning', tone: 'upcoming', daysLeft };
  return { label: 'Active', tone: 'safe', daysLeft };
}
function ninetyDayStatus(dueDate, now) {
  const daysLeft = diffDays(dueDate, now);
  if (daysLeft < 0) return { label: 'Overdue', tone: 'expired', daysLeft };
  if (daysLeft === 0) return { label: 'Due Today', tone: 'urgent', daysLeft };
  if (daysLeft <= 7) return { label: 'Urgent', tone: 'urgent', daysLeft };
  if (daysLeft <= 14) return { label: 'Action Needed', tone: 'actionNeeded', daysLeft };
  if (daysLeft <= 30) return { label: 'Prepare', tone: 'upcoming', daysLeft };
  return { label: 'Upcoming', tone: 'safe', daysLeft };
}
function passportStatus(expirationDate, now) {
  const daysLeft = diffDays(expirationDate, now);
  if (daysLeft < 0) return { label: 'Expired', tone: 'expired', daysLeft };
  if (daysLeft <= 30) return { label: 'Urgent', tone: 'urgent', daysLeft };
  if (daysLeft <= 90) return { label: 'Action Needed', tone: 'actionNeeded', daysLeft };
  if (daysLeft <= 180) return { label: 'Upcoming', tone: 'upcoming', daysLeft };
  return { label: 'Safe', tone: 'safe', daysLeft };
}
function fmtDaysLeft(daysLeft) {
  if (daysLeft < 0) return `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`;
  if (daysLeft === 0) return 'Today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`;
}
function fmtYearsMonths(expirationDate, now) {
  const due = parseDateOnly(expirationDate);
  let years = due.getFullYear() - now.getFullYear();
  let months = due.getMonth() - now.getMonth();
  if (due.getDate() < now.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return 'Expired';
  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0 || years === 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  return parts.join(' ') + ' remaining';
}

function useFinancialTotals({ incomes, expenses, obligations, balances, categories, monthKey, now }) {
  return useMemo(() => {
    const monthIncomes = incomes.filter((r) => inMonth(r.date, monthKey));
    const monthExpenses = expenses.filter((r) => inMonth(r.date, monthKey));
    const monthObligations = obligations.filter((o) => o.active !== false && obligationAppliesToMonth(o, monthKey));

    const totalIncome = monthIncomes.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalSpending = monthExpenses.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalObligations = monthObligations.reduce((s, o) => s + Number(o.amount || 0), 0);
    const unpaidObligations = monthObligations
      .filter((o) => !(o.paidMonths && o.paidMonths.includes(monthKey)))
      .reduce((s, o) => s + Number(o.amount || 0), 0);

    const availableMoney = totalIncome - totalSpending - unpaidObligations;

    const cashIncome = monthIncomes.filter((r) => r.account === 'Cash').reduce((s, r) => s + Number(r.amount || 0), 0);
    const bankIncome = monthIncomes.filter((r) => r.account !== 'Cash').reduce((s, r) => s + Number(r.amount || 0), 0);
    const cashExpense = monthExpenses.filter((r) => r.paymentMethod === 'Cash').reduce((s, r) => s + Number(r.amount || 0), 0);
    const bankExpense = monthExpenses.filter((r) => r.paymentMethod === 'Bank').reduce((s, r) => s + Number(r.amount || 0), 0);

    const cashBalance = Number(balances.cash || 0) + cashIncome - cashExpense;
    const bankBalance = Number(balances.bank || 0) + bankIncome - bankExpense;
    const totalAvailable = cashBalance + bankBalance;
    const spendableMoney = totalAvailable - unpaidObligations;

    const isCurrentMonth = monthKeyOf(now) === monthKey;
    const totalDays = daysInMonthOf(monthKey);
    const remainingDays = isCurrentMonth ? Math.max(totalDays - now.getDate() + 1, 1) : totalDays;

    const dailyGuide = spendableMoney > 0 ? spendableMoney / remainingDays : 0;
    const weeklyGuide = dailyGuide * 7;

    const incomeByType = INCOME_TYPES.map((type) => ({
      type,
      amount: monthIncomes.filter((r) => r.type === type).reduce((s, r) => s + Number(r.amount || 0), 0),
    }));
    const incomeByPerson = USERS.map((u) => ({
      person: u.name,
      amount: monthIncomes.filter((r) => r.personId === u.id).reduce((s, r) => s + Number(r.amount || 0), 0),
    })).filter((r) => r.amount > 0);

    const spendingByCategory = categories
      .map((c) => ({
        name: c.name,
        amount: monthExpenses.filter((r) => r.categoryId === c.id).reduce((s, r) => s + Number(r.amount || 0), 0),
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const spendingByPerson = USERS.map((u) => ({
      person: u.name,
      amount: monthExpenses.filter((r) => r.personId === u.id).reduce((s, r) => s + Number(r.amount || 0), 0),
    })).filter((r) => r.amount > 0);

    return {
      totalIncome, totalSpending, totalObligations, unpaidObligations, availableMoney,
      cashBalance, bankBalance, totalAvailable, spendableMoney,
      dailyGuide, weeklyGuide, remainingDays,
      incomeByType, incomeByPerson, spendingByCategory, spendingByPerson,
      monthIncomes, monthExpenses,
    };
  }, [incomes, expenses, obligations, balances, monthKey, now]);
}

function SummaryCard({ colors, icon: Icon, label, value, sub, tone = 'accent' }) {
  const toneColor = colors[tone] || colors.accent;
  const toneSoft = colors[`${tone}Soft`] || colors.accentSoft;
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14,
      padding: '16px 18px', flex: '1 1 180px', minWidth: 160,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, background: toneSoft, color: toneColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 600, color: colors.textPrimary, fontFamily: 'Inter, sans-serif' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MonthSelector({ colors, monthKey, setMonthKey }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}
        style={{
          width: 30, height: 30, borderRadius: 8, border: `1px solid ${colors.border}`,
          background: colors.surface, color: colors.textSecondary, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Previous month"
      >
        <ChevronLeft size={15} />
      </button>
      <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, minWidth: 130, textAlign: 'center' }}>
        {monthLabel(monthKey)}
      </span>
      <button
        onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}
        style={{
          width: 30, height: 30, borderRadius: 8, border: `1px solid ${colors.border}`,
          background: colors.surface, color: colors.textSecondary, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Next month"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

function BalanceEditor({ colors, balances, setBalances, totals }) {
  const [editing, setEditing] = useState(false);
  const [cash, setCash] = useState(balances.cash);
  const [bank, setBank] = useState(balances.bank);

  if (!editing) {
    return (
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14,
        padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Your money</span>
          <button
            onClick={() => { setCash(balances.cash); setBank(balances.bank); setEditing(true); }}
            style={{
              fontSize: 12, fontWeight: 500, color: colors.accent, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            Edit starting balance
          </button>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: colors.accentSoft, color: colors.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Banknote size={15} /></div>
            <div>
              <div style={{ fontSize: 11, color: colors.textFaint }}>Cash</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(totals.cashBalance)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: colors.goldSoft, color: colors.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Landmark size={15} /></div>
            <div>
              <div style={{ fontSize: 11, color: colors.textFaint }}>Bank</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(totals.bankBalance)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: colors.surfaceMuted, color: colors.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Scale size={15} /></div>
            <div>
              <div style={{ fontSize: 11, color: colors.textFaint }}>Total</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(totals.totalAvailable)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
        Set starting balance
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ flex: '1 1 120px', fontSize: 12, color: colors.textSecondary }}>
          Cash
          <input
            type="number" value={cash}
            onChange={(e) => setCash(e.target.value)}
            style={{
              display: 'block', width: '100%', marginTop: 4, padding: '8px 10px',
              borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg,
              color: colors.textPrimary, fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </label>
        <label style={{ flex: '1 1 120px', fontSize: 12, color: colors.textSecondary }}>
          Bank
          <input
            type="number" value={bank}
            onChange={(e) => setBank(e.target.value)}
            style={{
              display: 'block', width: '100%', marginTop: 4, padding: '8px 10px',
              borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg,
              color: colors.textPrimary, fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            setBalances({ cash: Number(cash) || 0, bank: Number(bank) || 0 });
            setEditing(false);
          }}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: colors.textPrimary, color: colors.bg, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
          }}
        >Save</button>
        <button
          onClick={() => setEditing(false)}
          style={{
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.textSecondary, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
          }}
        >Cancel</button>
      </div>
    </div>
  );
}

function SpendingGuide({ colors, totals }) {
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>
        Spending guide
      </div>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 14 }}>
        Based on spendable money and {totals.remainingDays} day{totals.remainingDays === 1 ? '' : 's'} remaining
      </div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: colors.textFaint }}>Monthly available</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(totals.spendableMoney)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textFaint }}>Weekly guide</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(totals.weeklyGuide)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.textFaint }}>Daily guide</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(totals.dailyGuide)}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ colors, text }) {
  return (
    <div style={{
      border: `1px dashed ${colors.border}`, borderRadius: 12, padding: '18px 16px',
      color: colors.textFaint, fontSize: 12.5, textAlign: 'center',
    }}>
      {text}
    </div>
  );
}

function FinancialOverviewTab({ colors, totals, monthKey, setMonthKey, balances, setBalances, debtTotals }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 13, color: colors.textSecondary }}>Combined household finances</span>
        <MonthSelector colors={colors} monthKey={monthKey} setMonthKey={setMonthKey} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard colors={colors} icon={TrendingUp} label="Total income" value={fmtCurrency(totals.totalIncome)} tone="safe" />
        <SummaryCard colors={colors} icon={TrendingDown} label="Total spending" value={fmtCurrency(totals.totalSpending)} tone="urgent" />
        <SummaryCard colors={colors} icon={ListChecks} label="Financial obligations" value={fmtCurrency(totals.totalObligations)} tone="upcoming" />
        <SummaryCard colors={colors} icon={Scale} label="Available money" value={fmtCurrency(totals.availableMoney)} tone="accent" sub="Income − spending − unpaid obligations" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <BalanceEditor colors={colors} balances={balances} setBalances={setBalances} totals={totals} />
        <SpendingGuide colors={colors} totals={totals} />
      </div>

      {debtTotals && debtTotals.totalOriginal > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
            Debt summary
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textFaint }}>Outstanding debt</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(debtTotals.totalOutstanding)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textFaint }}>Interest paid this month</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(debtTotals.interestPaidThisMonth)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textFaint }}>Principal repaid this month</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(debtTotals.principalPaidThisMonth)}</div>
            </div>
            {debtTotals.nextPlanned && (
              <div>
                <div style={{ fontSize: 11, color: colors.textFaint }}>Upcoming payment</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
                  {fmtCurrency(debtTotals.nextPlanned.plannedPrincipalAmount + debtTotals.nextPlanned.plannedInterestAmount)}
                </div>
              </div>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: colors.surfaceMuted, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, debtTotals.percentPaid)}%`, background: colors.safe, borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 4 }}>{debtTotals.percentPaid.toFixed(1)}% of original debt repaid</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
            Spending by category
          </div>
          {totals.spendingByCategory.length === 0 ? (
            <EmptyRow colors={colors} text="No spending recorded yet. Start by adding your first expense." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {totals.spendingByCategory.map((c) => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: colors.textSecondary }}>{c.name}</span>
                  <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{fmtCurrency(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
            Spending by person
          </div>
          {totals.spendingByPerson.length === 0 ? (
            <EmptyRow colors={colors} text="Nothing to split yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {totals.spendingByPerson.map((p) => (
                <div key={p.person} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: colors.textSecondary }}>{p.person}</span>
                  <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{fmtCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fieldLabelStyle(colors) {
  return { display: 'block', fontSize: 12, color: colors.textSecondary, marginBottom: 4 };
}
function fieldInputStyle(colors, hasError) {
  return {
    display: 'block', width: '100%', padding: '9px 10px', borderRadius: 8,
    border: `1px solid ${hasError ? colors.urgent : colors.border}`, background: colors.bg,
    color: colors.textPrimary, fontSize: 13, boxSizing: 'border-box', fontFamily: 'Inter, sans-serif',
  };
}

function Modal({ colors, onClose, title, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,22,20,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface, borderRadius: 16, border: `1px solid ${colors.border}`,
          boxShadow: colors.shadow, width: '100%', maxWidth: 420, maxHeight: '85vh',
          overflowY: 'auto', padding: '22px 22px 20px', fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>{title}</span>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: colors.textFaint, cursor: 'pointer' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ colors, text }) {
  if (!text) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: colors.textPrimary, color: colors.bg, padding: '10px 18px',
      borderRadius: 999, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
      zIndex: 200, fontFamily: 'Inter, sans-serif',
    }}>
      <Check size={14} />
      {text}
    </div>
  );
}

function FilterPills({ colors, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${active ? colors.accent : colors.border}`,
              background: active ? colors.accentSoft : 'transparent',
              color: active ? colors.accent : colors.textSecondary,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function IncomeModal({ colors, onClose, onSave, initial }) {
  const { personId: currentPersonId } = useCurrentUser();
  const personId = initial?.personId || currentPersonId;
  const [type, setType] = useState(initial?.type || INCOME_TYPES[0]);
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [date, setDate] = useState(initial?.date || monthKeyOf(new Date()) + '-01');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});

  function handleSave() {
    const errs = {};
    if (!(Number(amount) > 0)) errs.amount = 'Amount must be greater than 0.';
    if (!date) errs.date = 'Date is required.';
    if (!type) errs.type = 'Income type is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      personId, type, amount: Number(amount), date, notes,
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit income' : 'Add income'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Income type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={fieldInputStyle(colors, errors.type)}>
            {INCOME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Amount (THB)</label>
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0" style={fieldInputStyle(colors, errors.amount)}
          />
          {errors.amount && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.amount}</div>}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Date</label>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={fieldInputStyle(colors, errors.date)}
          />
          {errors.date && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.date}</div>}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save income</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function IncomeRow({ colors, record, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const person = USERS.find((u) => u.id === record.personId)?.name || record.personId;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 80px 1fr 100px 1fr auto', gap: 10, alignItems: 'center',
      padding: '10px 4px', borderBottom: `1px solid ${colors.border}`, fontSize: 13,
    }}>
      <span style={{ color: colors.textSecondary }}>{record.date}</span>
      <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{person}</span>
      <span style={{ color: colors.textSecondary }}>{record.type}</span>
      <span style={{ color: colors.textPrimary, fontWeight: 600, textAlign: 'right' }}>{fmtCurrency(record.amount)}</span>
      <span style={{ color: colors.textFaint, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {record.notes || '—'}
      </span>
      {confirming ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onDelete(record.id)} style={{ fontSize: 11.5, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
          <button onClick={() => setConfirming(false)} style={{ fontSize: 11.5, color: colors.textFaint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onEdit(record)} aria-label="Edit" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
          <button onClick={() => setConfirming(true)} aria-label="Delete" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}

function FinancialIncomeTab({ colors, financial }) {
  const { incomes, setIncomes, monthKey, setMonthKey, totals } = financial;
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [personFilter, setPersonFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }

  function handleSave(record) {
    setIncomes((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [...prev, record];
    });
    setModalOpen(false);
    setEditRecord(null);
    showToast(editRecord ? 'Income updated' : 'Income added');
  }

  function handleDelete(id) {
    setIncomes((prev) => prev.filter((r) => r.id !== id));
    showToast('Income deleted');
  }

  const filtered = totals.monthIncomes
    .filter((r) => personFilter === 'All' || USERS.find((u) => u.id === r.personId)?.name === personFilter)
    .filter((r) => typeFilter === 'All' || r.type === typeFilter)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <MonthSelector colors={colors} monthKey={monthKey} setMonthKey={setMonthKey} />
        <button
          onClick={() => { setEditRecord(null); setModalOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add income
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Income by type</div>
          {totals.incomeByType.every((t) => t.amount === 0) ? (
            <EmptyRow colors={colors} text="No income recorded for this month yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {totals.incomeByType.map((t) => (
                <div key={t.type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: colors.textSecondary }}>{t.type}</span>
                  <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{fmtCurrency(t.amount)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 7, borderTop: `1px solid ${colors.border}`, marginTop: 2 }}>
                <span style={{ color: colors.textPrimary, fontWeight: 600 }}>Total</span>
                <span style={{ color: colors.textPrimary, fontWeight: 700 }}>{fmtCurrency(totals.totalIncome)}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Income by person</div>
          {totals.incomeByPerson.length === 0 ? (
            <EmptyRow colors={colors} text="Nothing to split yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {totals.incomeByPerson.map((p) => (
                <div key={p.person} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: colors.textSecondary }}>{p.person}</span>
                  <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{fmtCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Income records</span>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <FilterPills colors={colors} options={['All', 'Miki', 'Alex', 'Shared']} value={personFilter} onChange={setPersonFilter} />
            <FilterPills colors={colors} options={['All', ...INCOME_TYPES]} value={typeFilter} onChange={setTypeFilter} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyRow colors={colors} text={`No income recorded for ${monthLabel(monthKey)} yet.`} />
        ) : (
          <div>
            {filtered.map((r) => (
              <IncomeRow
                key={r.id} colors={colors} record={r}
                onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <IncomeModal
          colors={colors} initial={editRecord}
          onClose={() => { setModalOpen(false); setEditRecord(null); }}
          onSave={handleSave}
        />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}

function ExpenseModal({ colors, onClose, onSave, initial, categories, obligations = [] }) {
  const activeCats = categories.filter((c) => c.active);
  const { personId: currentPersonId } = useCurrentUser();
  const personId = initial?.personId || currentPersonId;
  const [categoryId, setCategoryId] = useState(initial?.categoryId || activeCats[0]?.id || '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [date, setDate] = useState(initial?.date || monthKeyOf(new Date()) + '-01');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod || 'Cash');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});
  // Tracks whether the current amount came from an obligation's fixed amount
  // (rent, allowance, internet, etc.) vs. something the user typed themselves,
  // so switching category doesn't clobber a manual edit.
  const [amountSource, setAmountSource] = useState('manual');

  function obligationForCategory(catId) {
    return obligations.find(
      (o) => o.categoryId === catId && o.active && o.frequency === 'Monthly'
    );
  }

  function handleCategoryChange(newCategoryId) {
    setCategoryId(newCategoryId);
    if (initial) return; // don't auto-fill while editing an existing record
    const match = obligationForCategory(newCategoryId);
    if (match && (amountSource === 'obligation' || amount === '')) {
      setAmount(String(match.amount));
      setAmountSource('obligation');
    }
  }

  const matchedObligation = obligationForCategory(categoryId);

  function handleSave() {
    const errs = {};
    if (!(Number(amount) > 0)) errs.amount = 'Amount must be greater than 0.';
    if (!date) errs.date = 'Date is required.';
    if (!categoryId) errs.categoryId = 'Category is required.';
    if (!paymentMethod) errs.paymentMethod = 'Payment method is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      personId, categoryId, amount: Number(amount), date, paymentMethod, notes,
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit expense' : 'Add expense'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Category</label>
          <select value={categoryId} onChange={(e) => handleCategoryChange(e.target.value)} style={fieldInputStyle(colors, errors.categoryId)}>
            {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Amount (THB)</label>
          <input
            type="number" value={amount}
            onChange={(e) => { setAmount(e.target.value); setAmountSource('manual'); }}
            placeholder="0" style={fieldInputStyle(colors, errors.amount)}
          />
          {errors.amount && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.amount}</div>}
          {amountSource === 'obligation' && matchedObligation && (
            <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 4 }}>
              Auto-filled from your "{matchedObligation.name}" commitment — edit if this month is different.
            </div>
          )}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Date</label>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={fieldInputStyle(colors, errors.date)}
          />
          {errors.date && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.date}</div>}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Payment method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={fieldInputStyle(colors, errors.paymentMethod)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save expense</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function ExpenseRow({ colors, record, categoryName, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const person = USERS.find((u) => u.id === record.personId)?.name || record.personId;
  const PayIcon = record.paymentMethod === 'Cash' ? Banknote : Landmark;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 80px 1fr 100px 90px 1fr auto', gap: 10, alignItems: 'center',
      padding: '10px 4px', borderBottom: `1px solid ${colors.border}`, fontSize: 13,
    }}>
      <span style={{ color: colors.textSecondary }}>{record.date}</span>
      <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{person}</span>
      <span style={{ color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryName}</span>
      <span style={{ color: colors.textPrimary, fontWeight: 600, textAlign: 'right' }}>{fmtCurrency(record.amount)}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: colors.textFaint, fontSize: 12 }}>
        <PayIcon size={12} /> {record.paymentMethod}
      </span>
      <span style={{ color: colors.textFaint, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {record.notes || '—'}
      </span>
      {confirming ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onDelete(record.id)} style={{ fontSize: 11.5, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
          <button onClick={() => setConfirming(false)} style={{ fontSize: 11.5, color: colors.textFaint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onEdit(record)} aria-label="Edit" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
          <button onClick={() => setConfirming(true)} aria-label="Delete" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}

function CategoryBarChart({ colors, data, total }) {
  if (data.length === 0) {
    return <EmptyRow colors={colors} text="No spending recorded yet. Start by adding your first expense." />;
  }
  const max = Math.max(...data.map((d) => d.amount));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d) => (
        <div key={d.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: colors.textSecondary }}>{d.name}</span>
            <span style={{ color: colors.textPrimary, fontWeight: 500 }}>
              {fmtCurrency(d.amount)} <span style={{ color: colors.textFaint }}>({Math.round((d.amount / (total || 1)) * 100)}%)</span>
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: colors.surfaceMuted, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(d.amount / max) * 100}%`, background: colors.accent, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryManager({ colors, categories, setCategories, expenses, onClose }) {
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  function addCategory() {
    const name = newName.trim();
    if (!name) return;
    setCategories((prev) => [...prev, { id: genId(), name, active: true }]);
    setNewName('');
  }
  function saveRename(id) {
    const name = renameValue.trim();
    if (!name) return;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    setRenamingId(null);
  }
  function toggleActive(id) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
  }
  function deleteCategory(id) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <Modal colors={colors} onClose={onClose} title="Manage categories">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          style={{ ...fieldInputStyle(colors, false), flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
        />
        <button
          onClick={addCategory}
          style={{
            padding: '0 14px', borderRadius: 8, border: 'none', background: colors.accent,
            color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >Add</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {categories.map((c) => {
          const used = expenses.some((e) => e.categoryId === c.id);
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '8px 10px', borderRadius: 9, background: colors.surfaceMuted,
              opacity: c.active ? 1 : 0.55,
            }}>
              {renamingId === c.id ? (
                <input
                  value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(c.id); }}
                  style={{ ...fieldInputStyle(colors, false), flex: 1, padding: '5px 8px' }}
                />
              ) : (
                <span style={{ fontSize: 13, color: colors.textPrimary }}>{c.name}</span>
              )}
              <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
                {renamingId === c.id ? (
                  <button onClick={() => saveRename(c.id)} style={{ fontSize: 11.5, color: colors.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                ) : (
                  <button onClick={() => { setRenamingId(c.id); setRenameValue(c.name); }} style={{ fontSize: 11.5, color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}>Rename</button>
                )}
                <button onClick={() => toggleActive(c.id)} style={{ fontSize: 11.5, color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}>
                  {c.active ? 'Archive' : 'Unarchive'}
                </button>
                <button
                  onClick={() => !used && deleteCategory(c.id)}
                  disabled={used}
                  title={used ? "Can't delete — has expense records. Archive instead." : 'Delete'}
                  style={{
                    fontSize: 11.5, background: 'none', border: 'none',
                    color: used ? colors.textFaint : colors.urgent,
                    cursor: used ? 'not-allowed' : 'pointer',
                  }}
                >Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function FinancialExpensesTab({ colors, financial }) {
  const { expenses, setExpenses, categories, setCategories, monthKey, setMonthKey, totals, obligations } = financial;
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [personFilter, setPersonFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }

  function handleSave(record) {
    setExpenses((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [...prev, record];
    });
    setModalOpen(false);
    setEditRecord(null);
    showToast(editRecord ? 'Expense updated' : 'Expense added');
  }
  function handleDelete(id) {
    setExpenses((prev) => prev.filter((r) => r.id !== id));
    showToast('Expense deleted');
  }
  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name || 'Uncategorized';
  }

  const filtered = totals.monthExpenses
    .filter((r) => personFilter === 'All' || USERS.find((u) => u.id === r.personId)?.name === personFilter)
    .filter((r) => categoryFilter === 'All' || categoryName(r.categoryId) === categoryFilter)
    .filter((r) => paymentFilter === 'All' || r.paymentMethod === paymentFilter)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <MonthSelector colors={colors} monthKey={monthKey} setMonthKey={setMonthKey} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setCategoryModalOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9,
              border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textSecondary,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Manage categories</button>
          <button
            onClick={() => { setEditRecord(null); setModalOpen(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
              border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Add expense
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Spending by category</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{fmtCurrency(totals.totalSpending)}</span>
          </div>
          <CategoryBarChart colors={colors} data={totals.spendingByCategory} total={totals.totalSpending} />
        </div>

        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 10 }}>Spending by person</div>
          {totals.spendingByPerson.length === 0 ? (
            <EmptyRow colors={colors} text="Nothing to split yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {totals.spendingByPerson.map((p) => (
                <div key={p.person} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: colors.textSecondary }}>{p.person}</span>
                  <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{fmtCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Expense records</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <FilterPills colors={colors} options={['All', 'Miki', 'Alex', 'Shared']} value={personFilter} onChange={setPersonFilter} />
          <FilterPills colors={colors} options={['All', ...PAYMENT_METHODS]} value={paymentFilter} onChange={setPaymentFilter} />
          <select
            value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ ...fieldInputStyle(colors, false), width: 'auto', minWidth: 160 }}
          >
            <option value="All">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyRow colors={colors} text={`No expenses recorded for ${monthLabel(monthKey)} yet.`} />
        ) : (
          <div>
            {filtered.map((r) => (
              <ExpenseRow
                key={r.id} colors={colors} record={r} categoryName={categoryName(r.categoryId)}
                onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ExpenseModal
          colors={colors} initial={editRecord} categories={categories} obligations={obligations}
          onClose={() => { setModalOpen(false); setEditRecord(null); }}
          onSave={handleSave}
        />
      )}
      {categoryModalOpen && (
        <CategoryManager
          colors={colors} categories={categories} setCategories={setCategories} expenses={expenses}
          onClose={() => setCategoryModalOpen(false)}
        />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}

function ObligationModal({ colors, onClose, onSave, initial, categories }) {
  const { personId: currentPersonId } = useCurrentUser();
  const [name, setName] = useState(initial?.name || '');
  const [isShared, setIsShared] = useState(initial ? initial.personId === 'shared' : true);
  const [categoryId, setCategoryId] = useState(initial?.categoryId || categories[0]?.id || '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [frequency, setFrequency] = useState(initial?.frequency || 'Monthly');
  const [dueDate, setDueDate] = useState(initial?.dueDate || monthKeyOf(new Date()) + '-01');
  const [active, setActive] = useState(initial?.active !== false);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});
  const personId = isShared ? 'shared' : currentPersonId;

  function handleSave() {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required.';
    if (!(Number(amount) > 0)) errs.amount = 'Amount must be greater than 0.';
    if (!categoryId) errs.categoryId = 'Category is required.';
    if (!dueDate) errs.dueDate = 'Payment date is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      name: name.trim(), personId, categoryId, amount: Number(amount),
      frequency, dueDate, active, notes,
      paidMonths: initial?.paidMonths || [],
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit commitment' : 'Add commitment'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Monthly Rent" style={fieldInputStyle(colors, errors.name)}
          />
          {errors.name && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.name}</div>}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Amount (THB)</label>
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0" style={fieldInputStyle(colors, errors.amount)}
          />
          {errors.amount && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.amount}</div>}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={fieldInputStyle(colors, errors.categoryId)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, cursor: 'pointer' }}>
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          Shared between Miki and Alex
        </label>
        {!isShared && (
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: -8 }}>
            Will be assigned to you.
          </div>
        )}
        <div>
          <label style={fieldLabelStyle(colors)}>Frequency</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={fieldInputStyle(colors, false)}>
            {OBLIGATION_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Payment date</label>
          <input
            type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            style={fieldInputStyle(colors, errors.dueDate)}
          />
          {errors.dueDate && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.dueDate}</div>}
          {(frequency === 'Monthly' || frequency === 'Weekly' || frequency === 'Yearly') && (
            <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 4 }}>
              Only the day{frequency === 'Yearly' ? ' and month' : ''} is used — this repeats every {frequency.toLowerCase().replace('-', ' ')}.
            </div>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, cursor: 'pointer' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save commitment</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function StatusBadge({ colors, tone, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, background: colors[`${tone}Soft`], color: colors[tone],
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[tone] }} />
      {label}
    </span>
  );
}

function ObligationRow({ colors, o, categoryName, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const person = USERS.find((u) => u.id === o.personId)?.name || o.personId;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      padding: '12px 4px', borderBottom: `1px solid ${colors.border}`,
    }}>
      <div style={{ minWidth: 160, flex: '1 1 200px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.textPrimary }}>{o.name}</div>
        <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>
          {person} · {categoryName} · {o.frequency}
        </div>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.textPrimary, minWidth: 80, textAlign: 'right' }}>
        {fmtCurrency(o.amount)}
      </div>
      <div style={{ minWidth: 140, textAlign: 'right' }}>
        <div style={{ fontSize: 11.5, color: colors.textSecondary }}>
          {paymentScheduleLabel(o)}
        </div>
        {o.active === false && (
          <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}>Inactive</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {confirming ? (
          <>
            <button onClick={() => onDelete(o.id)} style={{ fontSize: 11.5, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
            <button onClick={() => setConfirming(false)} style={{ fontSize: 11.5, color: colors.textFaint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => onEdit(o)} aria-label="Edit" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
            <button onClick={() => setConfirming(true)} aria-label="Delete" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
          </>
        )}
      </div>
    </div>
  );
}

function FinancialObligationsTab({ colors, financial }) {
  const { obligations, setObligations, categories, totals } = financial;
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }

  function handleSave(record) {
    setObligations((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [...prev, record];
    });
    setModalOpen(false);
    setEditRecord(null);
    showToast(editRecord ? 'Commitment updated' : 'Commitment added');
  }
  function handleDelete(id) {
    // Commitments are just a template. Expenses already auto-recorded from
    // this commitment stay in Expenses as history, this only removes the
    // template so nothing further gets recorded from it going forward.
    setObligations((prev) => prev.filter((r) => r.id !== id));
    showToast('Commitment deleted');
  }
  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name || 'Uncategorized';
  }

  const list = obligations
    .filter((o) => o.active !== false)
    .sort((a, b) => Number(a.dueDate.slice(8, 10)) - Number(b.dueDate.slice(8, 10)));
  const totalCommitments = list.reduce((s, o) => s + Number(o.amount || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 13, color: colors.textSecondary }}>
          Recurring and one-time commitments
        </span>
        <button
          onClick={() => { setEditRecord(null); setModalOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add commitment
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard colors={colors} icon={ListChecks} label="Total commitments" value={fmtCurrency(totalCommitments)} tone="upcoming" />
        <SummaryCard colors={colors} icon={Scale} label="Spendable money" value={fmtCurrency(totals.spendableMoney)} tone="accent" sub="Total available − unpaid this month" />
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Commitments</span>
        </div>

        {list.length === 0 ? (
          <EmptyRow colors={colors} text="You don't have any commitments recorded." />
        ) : (
          <div>
            {list.map((o) => (
              <ObligationRow
                key={o.id} colors={colors} o={o}
                categoryName={categoryName(o.categoryId)}
                onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ObligationModal
          colors={colors} initial={editRecord} categories={categories}
          onClose={() => { setModalOpen(false); setEditRecord(null); }}
          onSave={handleSave}
        />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}

function DebtModal({ colors, onClose, onSave, initial }) {
  const { personId: currentPersonId } = useCurrentUser();
  const [name, setName] = useState(initial?.name || '');
  const [originalAmount, setOriginalAmount] = useState(initial?.originalAmount ?? '');
  const [startingBalance, setStartingBalance] = useState(initial?.startingBalance ?? initial?.originalAmount ?? '');
  const [isShared, setIsShared] = useState(initial ? initial.personId === 'shared' : true);
  const [debtType, setDebtType] = useState(initial?.debtType || 'Short-term');
  const [startDate, setStartDate] = useState(initial?.startDate || monthKeyOf(new Date()) + '-01');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [schedule, setSchedule] = useState(
    initial?.interestSchedule && initial.interestSchedule.length > 0
      ? initial.interestSchedule.map((p) => ({ ...p, effectiveUntil: p.effectiveUntil || '' }))
      : [{ id: genId(), monthlyInterestAmount: '', interestRate: '', effectiveFrom: monthKeyOf(new Date()), effectiveUntil: '', notes: '' }]
  );
  const [errors, setErrors] = useState({});
  const personId = isShared ? 'shared' : currentPersonId;

  function updatePeriod(id, patch) {
    setSchedule((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPeriod() {
    setSchedule((prev) => [...prev, {
      id: genId(), monthlyInterestAmount: '', interestRate: '',
      effectiveFrom: monthKeyOf(new Date()), effectiveUntil: '', notes: '',
    }]);
  }
  function removePeriod(id) {
    setSchedule((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  function handleSave() {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required.';
    if (!(Number(originalAmount) > 0)) errs.originalAmount = 'Original amount must be greater than 0.';
    if (startingBalance === '' || Number(startingBalance) < 0) errs.startingBalance = 'Current balance is required.';
    if (!startDate) errs.startDate = 'Start date is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      name: name.trim(),
      originalAmount: Number(originalAmount),
      startingBalance: Number(startingBalance),
      personId, startDate, notes, debtType,
      status: initial?.status || 'Active',
      interestSchedule: schedule
        .filter((p) => p.monthlyInterestAmount !== '')
        .map((p) => ({
          id: p.id,
          monthlyInterestAmount: Number(p.monthlyInterestAmount || 0),
          interestRate: p.interestRate === '' ? null : Number(p.interestRate),
          effectiveFrom: p.effectiveFrom,
          effectiveUntil: p.effectiveUntil || null,
          notes: p.notes || '',
        })),
      createdAt: initial?.createdAt || new Date().toISOString(),
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit debt' : 'Add debt'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Debt name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Personal Loan" style={fieldInputStyle(colors, errors.name)}
          />
          {errors.name && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.name}</div>}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Original loan amount</label>
            <input
              type="number" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)}
              style={fieldInputStyle(colors, errors.originalAmount)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Current outstanding balance</label>
            <input
              type="number" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)}
              style={fieldInputStyle(colors, errors.startingBalance)}
            />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: -6 }}>
          {initial
            ? 'Payments you record from here on reduce this balance automatically — only change it directly if you need to correct a mistake.'
            : 'If this loan already has payment history outside DailyOS, enter what\u2019s actually owed today. Future principal payments recorded here will reduce it from this number.'}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, cursor: 'pointer', height: 38 }}>
              <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
              Shared between Miki and Alex
            </label>
            {!isShared && (
              <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 4 }}>
                Will be assigned to you.
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Start date</label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              style={fieldInputStyle(colors, errors.startDate)}
            />
          </div>
        </div>

        <div>
          <label style={fieldLabelStyle(colors)}>Loan type</label>
          <select value={debtType} onChange={(e) => setDebtType(e.target.value)} style={fieldInputStyle(colors, false)}>
            {DEBT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 4 }}>
            Short-term: a loan you plan to fully repay soon. Long-term: an ongoing loan where you're currently only paying interest.
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={fieldLabelStyle(colors)}>Interest schedule</label>
            <button
              type="button" onClick={addPeriod}
              style={{ fontSize: 11.5, color: colors.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >+ Add period</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {schedule.map((p, i) => (
              <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 9, padding: 10, background: colors.surfaceMuted }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: colors.textFaint }}>Period {i + 1}</span>
                  {schedule.length > 1 && (
                    <button
                      type="button" onClick={() => removePeriod(p.id)}
                      style={{ fontSize: 11, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer' }}
                    >Remove</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...fieldLabelStyle(colors), fontSize: 11 }}>Monthly interest (THB)</label>
                    <input
                      type="number" value={p.monthlyInterestAmount}
                      onChange={(e) => updatePeriod(p.id, { monthlyInterestAmount: e.target.value })}
                      style={{ ...fieldInputStyle(colors, false), padding: '7px 9px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...fieldLabelStyle(colors), fontSize: 11 }}>Rate % (optional)</label>
                    <input
                      type="number" value={p.interestRate}
                      onChange={(e) => updatePeriod(p.id, { interestRate: e.target.value })}
                      style={{ ...fieldInputStyle(colors, false), padding: '7px 9px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...fieldLabelStyle(colors), fontSize: 11 }}>Effective from</label>
                    <input
                      type="month" value={p.effectiveFrom}
                      onChange={(e) => updatePeriod(p.id, { effectiveFrom: e.target.value })}
                      style={{ ...fieldInputStyle(colors, false), padding: '7px 9px' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...fieldLabelStyle(colors), fontSize: 11 }}>Effective until (optional)</label>
                    <input
                      type="month" value={p.effectiveUntil}
                      onChange={(e) => updatePeriod(p.id, { effectiveUntil: e.target.value })}
                      style={{ ...fieldInputStyle(colors, false), padding: '7px 9px' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 6 }}>
            Add a new period whenever the monthly interest changes instead of editing an old one — that keeps a history of how interest changed over time.
          </div>
        </div>

        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save debt</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function RecordDebtPaymentModal({ colors, onClose, onSave, debt, monthKey, initial, plannedId }) {
  const currentPeriod = currentInterestPeriod(debt.interestSchedule, monthKey);
  const [paymentDate, setPaymentDate] = useState(initial?.paymentDate || new Date().toISOString().slice(0, 10));
  const [interestAmount, setInterestAmount] = useState(
    initial?.interestAmount ?? currentPeriod?.monthlyInterestAmount ?? ''
  );
  const [principalAmount, setPrincipalAmount] = useState(initial?.principalAmount ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod || 'Bank');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});

  const total = (Number(interestAmount) || 0) + (Number(principalAmount) || 0);

  function handleTotalChange(value) {
    const t = Number(value) || 0;
    const interest = Number(interestAmount) || 0;
    setPrincipalAmount(String(Math.max(0, t - interest)));
  }

  function handleSave() {
    const errs = {};
    if (!paymentDate) errs.paymentDate = 'Payment date is required.';
    if (!(Number(interestAmount) >= 0)) errs.interestAmount = 'Enter 0 or more.';
    if (!(Number(principalAmount) >= 0)) errs.principalAmount = 'Enter 0 or more.';
    if (total <= 0) errs.total = 'Enter an interest or principal amount.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      debtId: debt.id,
      paymentDate,
      interestAmount: Number(interestAmount) || 0,
      principalAmount: Number(principalAmount) || 0,
      totalAmount: total,
      paymentMethod,
      notes,
      expenseId: initial?.expenseId || null,
      plannedId: plannedId || initial?.plannedId || null,
      createdAt: initial?.createdAt || new Date().toISOString(),
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit payment' : `Record payment — ${debt.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Payment date</label>
          <input
            type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
            style={fieldInputStyle(colors, errors.paymentDate)}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Interest portion</label>
            <input
              type="number" value={interestAmount}
              onChange={(e) => setInterestAmount(e.target.value)}
              style={fieldInputStyle(colors, errors.interestAmount)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Principal portion</label>
            <input
              type="number" value={principalAmount}
              onChange={(e) => setPrincipalAmount(e.target.value)}
              style={fieldInputStyle(colors, errors.principalAmount)}
            />
          </div>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Total payment</label>
          <input
            type="number" value={total || ''}
            onChange={(e) => handleTotalChange(e.target.value)}
            style={fieldInputStyle(colors, errors.total)}
          />
          <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 4 }}>
            Editing this keeps the interest portion fixed and adjusts principal to match.
          </div>
          {errors.total && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.total}</div>}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Payment method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={fieldInputStyle(colors, false)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>
        <div style={{ fontSize: 11.5, color: colors.textFaint, background: colors.surfaceMuted, borderRadius: 8, padding: '8px 10px' }}>
          The interest portion is recorded as an Interest expense. The principal portion reduces your {paymentMethod.toLowerCase()} balance directly and pays down this debt — it won't show up as a living expense.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save payment</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function PlannedPaymentModal({ colors, onClose, onSave, debt, monthKey, initial }) {
  const currentPeriod = currentInterestPeriod(debt.interestSchedule, monthKey);
  const [plannedDate, setPlannedDate] = useState(initial?.plannedDate || new Date().toISOString().slice(0, 10));
  const [plannedInterestAmount, setPlannedInterestAmount] = useState(
    initial?.plannedInterestAmount ?? currentPeriod?.monthlyInterestAmount ?? ''
  );
  const [plannedPrincipalAmount, setPlannedPrincipalAmount] = useState(initial?.plannedPrincipalAmount ?? '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});

  function handleSave() {
    const errs = {};
    if (!plannedDate) errs.plannedDate = 'Planned date is required.';
    const totalPlanned = (Number(plannedInterestAmount) || 0) + (Number(plannedPrincipalAmount) || 0);
    if (totalPlanned <= 0) errs.total = 'Enter a planned interest or principal amount.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      debtId: debt.id,
      plannedDate,
      plannedInterestAmount: Number(plannedInterestAmount) || 0,
      plannedPrincipalAmount: Number(plannedPrincipalAmount) || 0,
      status: initial?.status || 'Planned',
      notes,
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit planned payment' : `Plan a payment — ${debt.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Planned date</label>
          <input
            type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)}
            style={fieldInputStyle(colors, errors.plannedDate)}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Planned interest</label>
            <input
              type="number" value={plannedInterestAmount}
              onChange={(e) => setPlannedInterestAmount(e.target.value)}
              style={fieldInputStyle(colors, false)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Planned principal</label>
            <input
              type="number" value={plannedPrincipalAmount}
              onChange={(e) => setPlannedPrincipalAmount(e.target.value)}
              style={fieldInputStyle(colors, false)}
            />
          </div>
        </div>
        {errors.total && <div style={{ fontSize: 11.5, color: colors.urgent }}>{errors.total}</div>}
        <div style={{ fontSize: 11.5, color: colors.textFaint, background: colors.surfaceMuted, borderRadius: 8, padding: '8px 10px' }}>
          This won't change your outstanding balance until you actually record it as paid.
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save plan</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function DebtCard({ colors, debt, debtPayments, plannedDebtPayments, monthKey, now, financial, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editingDebt, setEditingDebt] = useState(false);
  const [recordModal, setRecordModal] = useState(null); // { initial?, plannedId? } | null
  const [planModal, setPlanModal] = useState(null); // { initial? } | null

  const { setDebts, setDebtPayments, setPlannedDebtPayments, setExpenses, setBalances, categories } = financial;

  const person = USERS.find((u) => u.id === debt.personId)?.name || debt.personId;
  const outstanding = debtOutstandingBalance(debt, debtPayments);
  const isPaidOff = outstanding <= 0;
  const percentPaid = debt.originalAmount > 0 ? ((debt.originalAmount - outstanding) / debt.originalAmount) * 100 : 0;
  const currentPeriod = currentInterestPeriod(debt.interestSchedule, monthKey);

  const payments = debtPaymentsForDebt(debt.id, debtPayments).sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : 1));
  let running = Number(debt.startingBalance ?? debt.originalAmount ?? 0);
  const paymentsWithRemaining = payments.map((p) => {
    running = Math.max(0, running - Number(p.principalAmount || 0));
    return { ...p, remainingAfter: running };
  }).reverse();

  const planned = plannedDebtPayments.filter((p) => p.debtId === debt.id).sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1));

  function interestCategoryId() {
    const found = categories.find((c) => c.name === 'Interest');
    return found ? found.id : categories[0]?.id;
  }

  function applyPaymentEffects(payment, sign) {
    // sign = +1 to apply, -1 to reverse
    if (Number(payment.principalAmount) > 0) {
      const key = payment.paymentMethod === 'Cash' ? 'cash' : 'bank';
      setBalances((prev) => ({
        ...prev,
        [key]: Number(prev[key] || 0) + sign * Number(payment.principalAmount),
      }));
    }
  }

  function handleRecordSave(payment) {
    const isEdit = !!recordModal?.initial;
    let expenseId = payment.expenseId;

    if (isEdit) {
      // reverse the old payment's effects first
      const old = recordModal.initial;
      applyPaymentEffects(old, -1);
      if (old.expenseId) setExpenses((prev) => prev.filter((e) => e.id !== old.expenseId));
      expenseId = null;
    }

    if (payment.interestAmount > 0) {
      expenseId = genId();
      setExpenses((prev) => [...prev, {
        id: expenseId, personId: debt.personId, categoryId: interestCategoryId(),
        amount: payment.interestAmount, date: payment.paymentDate, paymentMethod: payment.paymentMethod,
        notes: `Interest — ${debt.name}`,
      }]);
    } else {
      expenseId = null;
    }

    applyPaymentEffects(payment, 1);

    setDebtPayments((prev) => {
      const exists = prev.some((p) => p.id === payment.id);
      const record = { ...payment, expenseId };
      return exists ? prev.map((p) => (p.id === payment.id ? record : p)) : [...prev, record];
    });

    if (payment.plannedId) {
      setPlannedDebtPayments((prev) => prev.map((p) => (p.id === payment.plannedId ? { ...p, status: 'Paid' } : p)));
    }

    setRecordModal(null);
    showToast(isEdit ? 'Payment updated' : 'Payment recorded');
  }

  function handleDeletePayment(payment) {
    applyPaymentEffects(payment, -1);
    if (payment.expenseId) setExpenses((prev) => prev.filter((e) => e.id !== payment.expenseId));
    setDebtPayments((prev) => prev.filter((p) => p.id !== payment.id));
    showToast('Payment deleted');
  }

  function handlePlanSave(plan) {
    setPlannedDebtPayments((prev) => {
      const exists = prev.some((p) => p.id === plan.id);
      return exists ? prev.map((p) => (p.id === plan.id ? plan : p)) : [...prev, plan];
    });
    setPlanModal(null);
    showToast('Planned payment saved');
  }
  function handleCancelPlan(plan) {
    setPlannedDebtPayments((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: 'Cancelled' } : p)));
    showToast('Planned payment cancelled');
  }
  function handleDeletePlan(plan) {
    setPlannedDebtPayments((prev) => prev.filter((p) => p.id !== plan.id));
    showToast('Planned payment removed');
  }

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 2 }}>{person}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>{debt.name}</div>
        </div>
        <StatusBadge colors={colors} tone={isPaidOff ? 'safe' : 'accent'} label={isPaidOff ? 'Paid Off' : 'Active'} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: colors.textPrimary }}>{fmtCurrency(outstanding)}</span>
        <span style={{ fontSize: 11.5, color: colors.textFaint }}>of {fmtCurrency(debt.originalAmount)} original</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: colors.surfaceMuted, overflow: 'hidden', marginTop: 8 }}>
        <div style={{ height: '100%', width: `${Math.min(100, percentPaid)}%`, background: colors.accent, borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 4 }}>{percentPaid.toFixed(1)}% repaid</div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: colors.textFaint }}>Current monthly interest</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.textPrimary }}>
            {currentPeriod ? fmtCurrency(currentPeriod.monthlyInterestAmount) : '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button
          onClick={() => setRecordModal({})}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        ><Plus size={12} /> Record payment</button>
        <button
          onClick={() => setPlanModal({})}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999,
            border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        ><CalendarClock size={12} /> Plan payment</button>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginLeft: 'auto', fontSize: 12, color: colors.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
          }}
        >{expanded ? 'Hide history' : 'History'}</button>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
          {planned.filter((p) => p.status === 'Planned').length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.textSecondary, marginBottom: 6 }}>Upcoming</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {planned.filter((p) => p.status === 'Planned').map((p) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                    fontSize: 12, padding: '8px 10px', background: colors.upcomingSoft, borderRadius: 8,
                  }}>
                    <span style={{ color: colors.textPrimary }}>
                      {p.plannedDate} · Interest {fmtCurrency(p.plannedInterestAmount)} + Principal {fmtCurrency(p.plannedPrincipalAmount)}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setRecordModal({ initial: {
                          paymentDate: p.plannedDate, interestAmount: p.plannedInterestAmount,
                          principalAmount: p.plannedPrincipalAmount, paymentMethod: 'Bank', notes: p.notes,
                        }, plannedId: p.id })}
                        style={{ fontSize: 11, color: colors.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      >Mark paid</button>
                      <button onClick={() => handleCancelPlan(p)} style={{ fontSize: 11, color: colors.textFaint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={() => handleDeletePlan(p)} style={{ fontSize: 11, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.textSecondary, marginBottom: 6 }}>Payment history</div>
          {paymentsWithRemaining.length === 0 ? (
            <EmptyRow colors={colors} text="No payments recorded yet." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: colors.textFaint, textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Date</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Interest</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Principal</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Total</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Remaining</th>
                    <th style={{ padding: '4px 6px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsWithRemaining.map((p) => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '6px' }}>{p.paymentDate}</td>
                      <td style={{ padding: '6px' }}>{fmtCurrency(p.interestAmount)}</td>
                      <td style={{ padding: '6px' }}>{fmtCurrency(p.principalAmount)}</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>{fmtCurrency(p.totalAmount)}</td>
                      <td style={{ padding: '6px' }}>{fmtCurrency(p.remainingAfter)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setRecordModal({ initial: p })} aria-label="Edit" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 3 }}><Pencil size={12} /></button>
                        <button onClick={() => handleDeletePayment(p)} aria-label="Delete" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 3 }}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
        {confirming ? (
          <>
            <button
              onClick={() => {
                const linkedExpenseIds = debtPaymentsForDebt(debt.id, debtPayments).map((p) => p.expenseId).filter(Boolean);
                if (linkedExpenseIds.length > 0) setExpenses((prev) => prev.filter((e) => !linkedExpenseIds.includes(e.id)));
                setDebtPayments((prev) => prev.filter((p) => p.debtId !== debt.id));
                setPlannedDebtPayments((prev) => prev.filter((p) => p.debtId !== debt.id));
                setDebts((prev) => prev.filter((d) => d.id !== debt.id));
                showToast('Debt deleted');
              }}
              style={{ fontSize: 11.5, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >Delete debt</button>
            <button onClick={() => setConfirming(false)} style={{ fontSize: 11.5, color: colors.textFaint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditingDebt(true)} aria-label="Edit debt" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
            <button onClick={() => setConfirming(true)} aria-label="Delete debt" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
          </>
        )}
      </div>

      {recordModal && (
        <RecordDebtPaymentModal
          colors={colors} debt={debt} monthKey={monthKey}
          initial={recordModal.initial} plannedId={recordModal.plannedId}
          onClose={() => setRecordModal(null)}
          onSave={handleRecordSave}
        />
      )}
      {planModal && (
        <PlannedPaymentModal
          colors={colors} debt={debt} monthKey={monthKey} initial={planModal.initial}
          onClose={() => setPlanModal(null)}
          onSave={handlePlanSave}
        />
      )}
      {editingDebt && (
        <DebtModal
          colors={colors} initial={debt}
          onClose={() => setEditingDebt(false)}
          onSave={(updated) => {
            setDebts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditingDebt(false);
            showToast('Debt updated');
          }}
        />
      )}
    </div>
  );
}

function FinancialDebtTab({ colors, financial, now }) {
  const { debts, setDebts, debtPayments, plannedDebtPayments, monthKey, categories } = financial;
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }

  const debtTotals = useDebtTotals({ debts, debtPayments, plannedDebtPayments, monthKey });
  const hasInterestCategory = categories.some((c) => c.name === 'Interest');

  function handleAddDebt(record) {
    setDebts((prev) => [...prev, record]);
    setModalOpen(false);
    showToast('Debt added');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 13, color: colors.textSecondary }}>Debt & loan tracking</span>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        ><Plus size={14} /> Add debt</button>
      </div>

      {!hasInterestCategory && (
        <div style={{ fontSize: 12, color: colors.gold, background: colors.goldSoft, borderRadius: 9, padding: '10px 12px' }}>
          Your database is missing the "Interest" expense category — re-run the latest sql/schema.sql in Supabase to add it, so interest payments can be categorized correctly.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard colors={colors} icon={CreditCard} label="Total debt remaining" value={fmtCurrency(debtTotals.totalOutstanding)} tone="urgent" />
        <SummaryCard colors={colors} icon={TrendingUp} label="Monthly interest" value={fmtCurrency(debtTotals.monthlyInterestDue)} tone="upcoming" />
        <SummaryCard colors={colors} icon={TrendingDown} label="Principal paid this month" value={fmtCurrency(debtTotals.principalPaidThisMonth)} tone="safe" />
        <SummaryCard colors={colors} icon={Scale} label="Total debt payment this month" value={fmtCurrency(debtTotals.totalPaidThisMonth)} tone="accent" sub="Interest + principal paid" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard colors={colors} icon={CreditCard} label="To pay off this month" value={fmtCurrency(debtTotals.shortTermOutstanding)} tone="urgent" sub="Short-term loans" />
        <SummaryCard colors={colors} icon={CreditCard} label="Ongoing (interest-only)" value={fmtCurrency(debtTotals.longTermOutstanding)} tone="upcoming" sub="Long-term loans" />
      </div>

      {debtTotals.totalOriginal > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Debt projection</span>
            <span style={{ fontSize: 12, color: colors.textSecondary }}>{debtTotals.percentPaid.toFixed(1)}% of original debt repaid</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: colors.surfaceMuted, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, debtTotals.percentPaid)}%`, background: colors.safe, borderRadius: 999 }} />
          </div>
          {debtTotals.nextPlanned && (
            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 10 }}>
              Next planned payment {debtTotals.nextPlanned.plannedDate}: principal {fmtCurrency(debtTotals.nextPlanned.plannedPrincipalAmount)} →
              projected balance {fmtCurrency(Math.max(0, debtTotals.totalOutstanding - debtTotals.nextPlanned.plannedPrincipalAmount))}
            </div>
          )}
        </div>
      )}

      {debts.length === 0 ? (
        <EmptyRow colors={colors} text="No debts recorded yet. Add one to start tracking interest and principal payments." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {debts.map((debt) => (
            <DebtCard
              key={debt.id} colors={colors} debt={debt} debtPayments={debtPayments}
              plannedDebtPayments={plannedDebtPayments} monthKey={monthKey} now={now}
              financial={financial} showToast={showToast}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <DebtModal colors={colors} onClose={() => setModalOpen(false)} onSave={handleAddDebt} />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}


function FinancialPage({ colors, financial, now }) {
  const [tab, setTab] = useState('overview');
  const { monthKey, setMonthKey, balances, setBalances, totals, debtTotals } = financial;

  return (
    <div style={{ padding: '20px 24px 40px' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FINANCIAL_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 999,
                border: `1px solid ${active ? colors.accent : colors.border}`,
                background: active ? colors.accentSoft : colors.surface,
                color: active ? colors.accent : colors.textSecondary,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <FinancialOverviewTab
          colors={colors} totals={totals} monthKey={monthKey} setMonthKey={setMonthKey}
          balances={balances} setBalances={setBalances} debtTotals={debtTotals}
        />
      )}
      {tab === 'income' && <FinancialIncomeTab colors={colors} financial={financial} />}
      {tab === 'expenses' && <FinancialExpensesTab colors={colors} financial={financial} />}
      {tab === 'obligations' && <FinancialObligationsTab colors={colors} financial={financial} />}
      {tab === 'debt' && <FinancialDebtTab colors={colors} financial={financial} now={now} />}
    </div>
  );
}

const IMMIGRATION_TABS = [
  { id: 'visa', label: 'Visa', icon: BadgeCheck },
  { id: 'ninetyday', label: '90-Day Report', icon: CalendarDays },
  { id: 'passport', label: 'Passport', icon: Fingerprint },
];

function VisaModal({ colors, onClose, onSave, initial }) {
  const { personId: currentPersonId } = useCurrentUser();
  const personId = initial?.personId || currentPersonId;
  const [visaType, setVisaType] = useState(initial?.visaType || '');
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [expirationDate, setExpirationDate] = useState(initial?.expirationDate || '');
  const [renewalStatus, setRenewalStatus] = useState(initial?.renewalStatus || 'Not Started');
  const [visaNumber, setVisaNumber] = useState(initial?.visaNumber || '');
  const [institution, setInstitution] = useState(initial?.institution || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});

  function handleSave() {
    const errs = {};
    if (!visaType.trim()) errs.visaType = 'Visa type is required.';
    if (!startDate) errs.startDate = 'Start date is required.';
    if (!expirationDate) errs.expirationDate = 'Expiration date is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      personId, visaType: visaType.trim(), startDate, expirationDate, renewalStatus,
      visaNumber: visaNumber.trim(), institution: institution.trim(), notes,
      checklist: initial?.checklist || DEFAULT_VISA_CHECKLIST.map((i) => ({ ...i, id: genId() })),
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit visa' : 'Add visa'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Visa type</label>
          <input
            value={visaType} onChange={(e) => setVisaType(e.target.value)}
            placeholder="e.g. ED Plus Visa" style={fieldInputStyle(colors, errors.visaType)}
          />
          {errors.visaType && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.visaType}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldInputStyle(colors, errors.startDate)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Expiration date</label>
            <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} style={fieldInputStyle(colors, errors.expirationDate)} />
          </div>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Renewal status</label>
          <select value={renewalStatus} onChange={(e) => setRenewalStatus(e.target.value)} style={fieldInputStyle(colors, false)}>
            {RENEWAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Visa number (optional)</label>
          <input value={visaNumber} onChange={(e) => setVisaNumber(e.target.value)} style={fieldInputStyle(colors, false)} />
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Institution / sponsor (optional)</label>
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} style={fieldInputStyle(colors, false)} />
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save visa</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function VisaChecklist({ colors, visa, onUpdateChecklist }) {
  const [newItem, setNewItem] = useState('');
  const checklist = visa.checklist || [];
  const done = checklist.filter((i) => i.completed).length;

  function addItem() {
    const title = newItem.trim();
    if (!title) return;
    onUpdateChecklist([...checklist, { id: genId(), title, completed: false }]);
    setNewItem('');
  }
  function toggleItem(id) {
    onUpdateChecklist(checklist.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)));
  }
  function removeItem(id) {
    onUpdateChecklist(checklist.filter((i) => i.id !== id));
  }

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 8 }}>
        Preparation checklist ({done}/{checklist.length}) — your own reminders, not official requirements
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {checklist.map((item) => (
          <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={item.completed} onChange={() => toggleItem(item.id)} />
            <span style={{
              flex: 1, color: item.completed ? colors.textFaint : colors.textPrimary,
              textDecoration: item.completed ? 'line-through' : 'none',
            }}>{item.title}</span>
            <button
              onClick={() => removeItem(item.id)}
              style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 2 }}
              aria-label="Remove item"
            ><X size={12} /></button>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newItem} onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
          placeholder="Add checklist item" style={{ ...fieldInputStyle(colors, false), flex: 1, padding: '6px 9px', fontSize: 12.5 }}
        />
        <button
          onClick={addItem}
          style={{ padding: '0 12px', borderRadius: 8, border: 'none', background: colors.accentSoft, color: colors.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >Add</button>
      </div>
    </div>
  );
}

function VisaCard({ colors, visa, now, onEdit, onDelete, onUpdateChecklist }) {
  const [confirming, setConfirming] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const person = USERS.find((u) => u.id === visa.personId)?.name || visa.personId;
  const status = visaStatus(visa.expirationDate, now);

  const start = parseDateOnly(visa.startDate).getTime();
  const end = parseDateOnly(visa.expirationDate).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const pct = end > start ? Math.min(100, Math.max(0, ((today - start) / (end - start)) * 100)) : 100;

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 2 }}>{person}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>{visa.visaType}</div>
        </div>
        <StatusBadge colors={colors} tone={status.tone} label={status.label} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 12 }}>
        {fmtDaysLeft(status.daysLeft)}
      </div>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>
        Expires {visa.expirationDate}
      </div>

      <div style={{ height: 6, borderRadius: 999, background: colors.surfaceMuted, overflow: 'hidden', marginTop: 10 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colors[status.tone], borderRadius: 999 }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ fontSize: 12, color: colors.textSecondary }}>
          Renewal: <span style={{ fontWeight: 600, color: colors.textPrimary }}>{visa.renewalStatus}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowChecklist(!showChecklist)}
            aria-label="Toggle checklist"
            style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}
          ><ClipboardList size={14} /></button>
          {confirming ? (
            <>
              <button onClick={() => onDelete(visa.id)} style={{ fontSize: 11.5, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
              <button onClick={() => setConfirming(false)} style={{ fontSize: 11.5, color: colors.textFaint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => onEdit(visa)} aria-label="Edit" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
              <button onClick={() => setConfirming(true)} aria-label="Delete" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>

      {showChecklist && (
        <VisaChecklist colors={colors} visa={visa} onUpdateChecklist={(checklist) => onUpdateChecklist(visa.id, checklist)} />
      )}
    </div>
  );
}

function ImmigrationSummaryCard({ colors, icon: Icon, label, empty, person, sub, tone }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px', flex: '1 1 220px', minWidth: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: colors.accentSoft, color: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.textSecondary }}>{label}</span>
      </div>
      {empty ? (
        <div style={{ fontSize: 12.5, color: colors.textFaint }}>Nothing added yet.</div>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{person}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[tone] }} />
            <span style={{ fontSize: 12, color: colors.textSecondary }}>{sub}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ImmigrationOverview({ colors, visas, ninetyDayReports, passports, now }) {
  const nearestVisa = visas.length > 0
    ? [...visas].sort((a, b) => diffDays(a.expirationDate, now) - diffDays(b.expirationDate, now))[0]
    : null;
  const nearestVisaStatus = nearestVisa ? visaStatus(nearestVisa.expirationDate, now) : null;

  const activeReports = ninetyDayReports.filter((r) => !r.completed);
  const nearestReport = activeReports.length > 0
    ? [...activeReports].sort((a, b) => diffDays(a.nextDueDate, now) - diffDays(b.nextDueDate, now))[0]
    : null;
  const nearestReportStatus = nearestReport ? ninetyDayStatus(nearestReport.nextDueDate, now) : null;

  const nearestPassport = passports.length > 0
    ? [...passports].sort((a, b) => diffDays(a.expirationDate, now) - diffDays(b.expirationDate, now))[0]
    : null;
  const nearestPassportStatus = nearestPassport ? passportStatus(nearestPassport.expirationDate, now) : null;

  function personVisaCell(personId) {
    const personVisas = visas.filter((v) => v.personId === personId);
    if (personVisas.length === 0) return { label: '—', tone: 'expired' };
    const nearest = [...personVisas].sort((a, b) => diffDays(a.expirationDate, now) - diffDays(b.expirationDate, now))[0];
    return visaStatus(nearest.expirationDate, now);
  }
  function personReportCell(personId) {
    const personReports = activeReports.filter((r) => r.personId === personId);
    if (personReports.length === 0) return null;
    const nearest = [...personReports].sort((a, b) => diffDays(a.nextDueDate, now) - diffDays(b.nextDueDate, now))[0];
    return ninetyDayStatus(nearest.nextDueDate, now);
  }
  function personPassportCell(personId) {
    const personPassports = passports.filter((p) => p.personId === personId);
    if (personPassports.length === 0) return null;
    const nearest = [...personPassports].sort((a, b) => diffDays(a.expirationDate, now) - diffDays(b.expirationDate, now))[0];
    return passportStatus(nearest.expirationDate, now);
  }
  const mikiVisa = personVisaCell('miki');
  const alexVisa = personVisaCell('alex');
  const mikiReport = personReportCell('miki');
  const alexReport = personReportCell('alex');
  const mikiPassport = personPassportCell('miki');
  const alexPassport = personPassportCell('alex');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ImmigrationSummaryCard
          colors={colors} icon={BadgeCheck} label="Visa"
          empty={!nearestVisa}
          person={nearestVisa ? `${USERS.find((u) => u.id === nearestVisa.personId)?.name}'s ${nearestVisa.visaType}` : ''}
          sub={nearestVisaStatus ? fmtDaysLeft(nearestVisaStatus.daysLeft) : ''}
          tone={nearestVisaStatus?.tone}
        />
        <ImmigrationSummaryCard
          colors={colors} icon={CalendarDays} label="90-Day Report"
          empty={!nearestReport}
          person={nearestReport ? `${USERS.find((u) => u.id === nearestReport.personId)?.name}'s next report` : ''}
          sub={nearestReportStatus ? fmtDaysLeft(nearestReportStatus.daysLeft) : ''}
          tone={nearestReportStatus?.tone}
        />
        <ImmigrationSummaryCard
          colors={colors} icon={Fingerprint} label="Passport"
          empty={!nearestPassport}
          person={nearestPassport ? `${USERS.find((u) => u.id === nearestPassport.personId)?.name}'s passport` : ''}
          sub={nearestPassportStatus ? fmtYearsMonths(nearestPassport.expirationDate, now) : ''}
          tone={nearestPassportStatus?.tone}
        />
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px', overflowX: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>Both-person view</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 340 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: colors.textFaint, fontWeight: 500, fontSize: 12, paddingBottom: 8 }}></th>
              <th style={{ textAlign: 'left', color: colors.textFaint, fontWeight: 500, fontSize: 12, paddingBottom: 8 }}>Miki</th>
              <th style={{ textAlign: 'left', color: colors.textFaint, fontWeight: 500, fontSize: 12, paddingBottom: 8 }}>Alex</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${colors.border}` }}>
              <td style={{ padding: '8px 0', color: colors.textSecondary }}>Visa</td>
              <td style={{ padding: '8px 0' }}><StatusBadge colors={colors} tone={mikiVisa.tone} label={mikiVisa.label} /></td>
              <td style={{ padding: '8px 0' }}><StatusBadge colors={colors} tone={alexVisa.tone} label={alexVisa.label} /></td>
            </tr>
            <tr style={{ borderTop: `1px solid ${colors.border}` }}>
              <td style={{ padding: '8px 0', color: colors.textSecondary }}>90-Day Report</td>
              <td style={{ padding: '8px 0' }}>
                {mikiReport ? <StatusBadge colors={colors} tone={mikiReport.tone} label={mikiReport.label} /> : <span style={{ color: colors.textFaint, fontSize: 12 }}>Not added yet</span>}
              </td>
              <td style={{ padding: '8px 0' }}>
                {alexReport ? <StatusBadge colors={colors} tone={alexReport.tone} label={alexReport.label} /> : <span style={{ color: colors.textFaint, fontSize: 12 }}>Not added yet</span>}
              </td>
            </tr>
            <tr style={{ borderTop: `1px solid ${colors.border}` }}>
              <td style={{ padding: '8px 0', color: colors.textSecondary }}>Passport</td>
              <td style={{ padding: '8px 0' }}>
                {mikiPassport ? <StatusBadge colors={colors} tone={mikiPassport.tone} label={mikiPassport.label} /> : <span style={{ color: colors.textFaint, fontSize: 12 }}>Not added yet</span>}
              </td>
              <td style={{ padding: '8px 0' }}>
                {alexPassport ? <StatusBadge colors={colors} tone={alexPassport.tone} label={alexPassport.label} /> : <span style={{ color: colors.textFaint, fontSize: 12 }}>Not added yet</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImmigrationVisaTab({ colors, visas, setVisas, now }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [personFilter, setPersonFilter] = useState('All');
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }

  function handleSave(record) {
    setVisas((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [...prev, record];
    });
    setModalOpen(false);
    setEditRecord(null);
    showToast(editRecord ? 'Visa updated' : 'Visa added');
  }
  function handleDelete(id) {
    setVisas((prev) => prev.filter((r) => r.id !== id));
    showToast('Visa deleted');
  }
  function handleUpdateChecklist(id, checklist) {
    setVisas((prev) => prev.map((v) => (v.id === id ? { ...v, checklist } : v)));
  }

  const filtered = visas.filter((v) => personFilter === 'All' || USERS.find((u) => u.id === v.personId)?.name === personFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <FilterPills colors={colors} options={['All', 'Miki', 'Alex']} value={personFilter} onChange={setPersonFilter} />
        <button
          onClick={() => { setEditRecord(null); setModalOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add visa
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyRow colors={colors} text="No visa information recorded yet." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map((v) => (
            <VisaCard
              key={v.id} colors={colors} visa={v} now={now}
              onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
              onDelete={handleDelete}
              onUpdateChecklist={handleUpdateChecklist}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <VisaModal
          colors={colors} initial={editRecord}
          onClose={() => { setModalOpen(false); setEditRecord(null); }}
          onSave={handleSave}
        />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}

function NinetyDayModal({ colors, onClose, onSave }) {
  const { personId } = useCurrentUser();
  const [lastReportDate, setLastReportDate] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});

  const suggested = lastReportDate ? addDays(lastReportDate, 90) : '';

  function handleSave() {
    const errs = {};
    if (!lastReportDate) errs.lastReportDate = 'Last report date is required.';
    if (!nextDueDate && !suggested) errs.nextDueDate = 'Next due date is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: genId(), personId, lastReportDate, nextDueDate: nextDueDate || suggested, notes,
      completed: false, completedDate: null, createdAt: new Date().toISOString(),
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title="Add 90-day report">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Last report date</label>
          <input
            type="date" value={lastReportDate}
            onChange={(e) => setLastReportDate(e.target.value)}
            style={fieldInputStyle(colors, errors.lastReportDate)}
          />
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Next due date</label>
          <input type="date" value={nextDueDate || suggested} onChange={(e) => setNextDueDate(e.target.value)} style={fieldInputStyle(colors, errors.nextDueDate)} />
          {suggested && (
            <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 4 }}>
              Suggested date: {suggested} (based on the date you entered — override if your official due date differs)
            </div>
          )}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >Save</button>
          <button
            onClick={onClose}
            style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function CompleteReportModal({ colors, onClose, onComplete, record }) {
  const [completionDate, setCompletionDate] = useState(monthKeyOf(new Date()) + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [useSuggested, setUseSuggested] = useState(true);
  const suggested = addDays(completionDate, 90);
  const [customDate, setCustomDate] = useState(suggested);
  const [notes, setNotes] = useState('');

  return (
    <Modal colors={colors} onClose={onClose} title="Mark 90-day report as completed">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Completion date</label>
          <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} style={fieldInputStyle(colors, false)} />
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={useSuggested} onChange={(e) => setUseSuggested(e.target.checked)} />
            Use suggested next due date ({addDays(completionDate, 90)})
          </label>
          {!useSuggested && (
            <div>
              <label style={fieldLabelStyle(colors)}>New next due date</label>
              <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} style={fieldInputStyle(colors, false)} />
            </div>
          )}
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => onComplete({ completionDate, nextDueDate: useSuggested ? addDays(completionDate, 90) : customDate, notes })}
            style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >Complete report</button>
          <button
            onClick={onClose}
            style={{ padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function NinetyDayPersonCard({ colors, personId, records, now, onComplete, onDelete }) {
  const [showHistory, setShowHistory] = useState(false);
  const person = USERS.find((u) => u.id === personId)?.name || personId;
  const personRecords = records.filter((r) => r.personId === personId);
  const active = personRecords.filter((r) => !r.completed).sort((a, b) => diffDays(a.nextDueDate, now) - diffDays(b.nextDueDate, now))[0];
  const history = personRecords.filter((r) => r.completed).sort((a, b) => (a.completedDate < b.completedDate ? 1 : -1));

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 2 }}>{person}</div>

      {!active ? (
        <EmptyRow colors={colors} text="No 90-day report information recorded yet." />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>Next 90-Day Report</div>
            <StatusBadge colors={colors} tone={ninetyDayStatus(active.nextDueDate, now).tone} label={ninetyDayStatus(active.nextDueDate, now).label} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 10 }}>
            {fmtDaysLeft(diffDays(active.nextDueDate, now))}
          </div>
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>Due {active.nextDueDate}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => onComplete(active)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: colors.accentSoft, color: colors.accent, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >Mark as Completed</button>
            <button
              onClick={() => onDelete(active.id)}
              aria-label="Delete" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: '0 6px' }}
            ><Trash2 size={13} /></button>
          </div>
        </>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: colors.textSecondary, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: 0 }}
          >
            <History size={13} /> {showHistory ? 'Hide' : 'View'} history ({history.length})
          </button>
          {showHistory && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: colors.textSecondary }}>
                  <span>{r.lastReportDate} → {r.nextDueDate}</span>
                  <span style={{ color: colors.safe, fontWeight: 600 }}>Completed {r.completedDate}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImmigrationNinetyDayTab({ colors, ninetyDayReports, setNinetyDayReports, now }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [completingRecord, setCompletingRecord] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }

  function handleSave(record) {
    setNinetyDayReports((prev) => [...prev, record]);
    setModalOpen(false);
    showToast('90-day report added');
  }
  function handleDelete(id) {
    setNinetyDayReports((prev) => prev.filter((r) => r.id !== id));
    showToast('Record deleted');
  }
  function handleComplete({ completionDate, nextDueDate, notes }) {
    setNinetyDayReports((prev) => {
      const updated = prev.map((r) => (r.id === completingRecord.id ? { ...r, completed: true, completedDate: completionDate } : r));
      return [...updated, {
        id: genId(), personId: completingRecord.personId,
        lastReportDate: completionDate, nextDueDate, notes,
        completed: false, completedDate: null, createdAt: new Date().toISOString(),
      }];
    });
    setCompletingRecord(null);
    showToast('Report completed — next due date created');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add 90-Day Report
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {USERS.filter((u) => u.id !== 'shared').map((u) => (
          <NinetyDayPersonCard
            key={u.id} colors={colors} personId={u.id} records={ninetyDayReports} now={now}
            onComplete={(rec) => setCompletingRecord(rec)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {modalOpen && (
        <NinetyDayModal colors={colors} onClose={() => setModalOpen(false)} onSave={handleSave} />
      )}
      {completingRecord && (
        <CompleteReportModal
          colors={colors} record={completingRecord}
          onClose={() => setCompletingRecord(null)}
          onComplete={handleComplete}
        />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}

function PassportModal({ colors, onClose, onSave, initial }) {
  const { personId: currentPersonId } = useCurrentUser();
  const personId = initial?.personId || currentPersonId;
  const [passportNumber, setPassportNumber] = useState(initial?.passportNumber || '');
  const [issueDate, setIssueDate] = useState(initial?.issueDate || '');
  const [expirationDate, setExpirationDate] = useState(initial?.expirationDate || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});

  function handleSave() {
    const errs = {};
    if (!issueDate) errs.issueDate = 'Issue date is required.';
    if (!expirationDate) errs.expirationDate = 'Expiration date is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      personId, passportNumber: passportNumber.trim(), issueDate, expirationDate, notes,
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit passport' : 'Add passport'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Issue date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={fieldInputStyle(colors, errors.issueDate)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Expiration date</label>
            <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} style={fieldInputStyle(colors, errors.expirationDate)} />
          </div>
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Passport number (optional)</label>
          <input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} style={fieldInputStyle(colors, false)} />
        </div>
        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9, border: 'none',
              background: colors.textPrimary, color: colors.bg, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Save passport</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 9, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function PassportCard({ colors, passport, now, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const person = USERS.find((u) => u.id === passport.personId)?.name || passport.personId;
  const status = passportStatus(passport.expirationDate, now);

  const start = parseDateOnly(passport.issueDate).getTime();
  const end = parseDateOnly(passport.expirationDate).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const pct = end > start ? Math.min(100, Math.max(0, ((today - start) / (end - start)) * 100)) : 100;

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 2 }}>{person}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>
            Passport{passport.passportNumber ? ` · ${passport.passportNumber}` : ''}
          </div>
        </div>
        <StatusBadge colors={colors} tone={status.tone} label={status.label} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginTop: 12 }}>
        {fmtYearsMonths(passport.expirationDate, now)}
      </div>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>
        Expires {passport.expirationDate} · {fmtDaysLeft(status.daysLeft)}
      </div>

      <div style={{ height: 6, borderRadius: 999, background: colors.surfaceMuted, overflow: 'hidden', marginTop: 10 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colors[status.tone], borderRadius: 999 }} />
      </div>

      {passport.notes && (
        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 10 }}>{passport.notes}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 12 }}>
        {confirming ? (
          <>
            <button onClick={() => onDelete(passport.id)} style={{ fontSize: 11.5, color: colors.urgent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
            <button onClick={() => setConfirming(false)} style={{ fontSize: 11.5, color: colors.textFaint, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => onEdit(passport)} aria-label="Edit" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
            <button onClick={() => setConfirming(true)} aria-label="Delete" style={{ border: 'none', background: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
          </>
        )}
      </div>
    </div>
  );
}

function ImmigrationPassportTab({ colors, passports, setPassports, now }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [personFilter, setPersonFilter] = useState('All');
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }

  function handleSave(record) {
    setPassports((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [...prev, record];
    });
    setModalOpen(false);
    setEditRecord(null);
    showToast(editRecord ? 'Passport updated' : 'Passport added');
  }
  function handleDelete(id) {
    setPassports((prev) => prev.filter((r) => r.id !== id));
    showToast('Passport deleted');
  }

  const filtered = passports.filter((p) => personFilter === 'All' || USERS.find((u) => u.id === p.personId)?.name === personFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <FilterPills colors={colors} options={['All', 'Miki', 'Alex']} value={personFilter} onChange={setPersonFilter} />
        <button
          onClick={() => { setEditRecord(null); setModalOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add passport
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyRow colors={colors} text="No passport information recorded yet." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map((p) => (
            <PassportCard
              key={p.id} colors={colors} passport={p} now={now}
              onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <PassportModal
          colors={colors} initial={editRecord}
          onClose={() => { setModalOpen(false); setEditRecord(null); }}
          onSave={handleSave}
        />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}

function ImmigrationPage({ colors, immigration, now }) {
  const [tab, setTab] = useState('visa');
  const { visas, setVisas, ninetyDayReports, setNinetyDayReports, passports, setPassports } = immigration;

  return (
    <div style={{ padding: '20px 24px 40px' }}>
      <ImmigrationOverview colors={colors} visas={visas} ninetyDayReports={ninetyDayReports} passports={passports} now={now} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {IMMIGRATION_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 999,
                border: `1px solid ${active ? colors.accent : colors.border}`,
                background: active ? colors.accentSoft : colors.surface,
                color: active ? colors.accent : colors.textSecondary,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'visa' && <ImmigrationVisaTab colors={colors} visas={visas} setVisas={setVisas} now={now} />}
      {tab === 'ninetyday' && <ImmigrationNinetyDayTab colors={colors} ninetyDayReports={ninetyDayReports} setNinetyDayReports={setNinetyDayReports} now={now} />}
      {tab === 'passport' && <ImmigrationPassportTab colors={colors} passports={passports} setPassports={setPassports} now={now} />}
    </div>
  );
}

function DashboardSectionLabel({ colors, children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
      color: colors.textSecondary, marginBottom: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {children}
    </div>
  );
}

function DashboardLink({ colors, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none', background: 'none', color: colors.accent,
        fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', gap: 2,
      }}
    >
      {children} <ChevronRight size={13} />
    </button>
  );
}

function buildSuggestions({ totals, visas, ninetyDayReports, passports, debtTotals, now }) {
  const tips = [];

  const activeReports = ninetyDayReports.filter((r) => !r.completed);
  const urgentVisa = visas
    .map((v) => ({ v, status: visaStatus(v.expirationDate, now) }))
    .filter((x) => x.status.daysLeft <= 90)
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft)[0];
  if (urgentVisa) {
    const name = USERS.find((u) => u.id === urgentVisa.v.personId)?.name;
    tips.push({
      tone: urgentVisa.status.tone,
      text: `${name}'s ${urgentVisa.v.visaType} ${urgentVisa.status.daysLeft < 0 ? 'has expired' : `expires in ${urgentVisa.status.daysLeft} days`}. Consider preparing renewal documents.`,
    });
  }

  const urgentReport = activeReports
    .map((r) => ({ r, status: ninetyDayStatus(r.nextDueDate, now) }))
    .filter((x) => x.status.daysLeft <= 30)
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft)[0];
  if (urgentReport) {
    const name = USERS.find((u) => u.id === urgentReport.r.personId)?.name;
    tips.push({
      tone: urgentReport.status.tone,
      text: `${name}'s 90-day report ${urgentReport.status.daysLeft < 0 ? 'is overdue' : `is due in ${urgentReport.status.daysLeft} days`}.`,
    });
  }

  const urgentPassport = (passports || [])
    .map((p) => ({ p, status: passportStatus(p.expirationDate, now) }))
    .filter((x) => x.status.daysLeft <= 180)
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft)[0];
  if (urgentPassport) {
    const name = USERS.find((u) => u.id === urgentPassport.p.personId)?.name;
    tips.push({
      tone: urgentPassport.status.tone,
      text: `${name}'s passport ${urgentPassport.status.daysLeft < 0 ? 'has expired' : `expires in about ${fmtYearsMonths(urgentPassport.p.expirationDate, now).replace(' remaining', '')}`}. Consider checking renewal requirements.`,
    });
  }

  if (totals.spendableMoney < 0) {
    tips.push({ tone: 'urgent', text: "You're projected to run negative this month based on current spending and obligations." });
  } else if (totals.dailyGuide > 0 && totals.dailyGuide < 300) {
    tips.push({ tone: 'upcoming', text: `Your suggested daily spending is ${fmtCurrency(totals.dailyGuide)} — tighter than usual.` });
  }

  if (debtTotals && debtTotals.nextPlanned) {
    tips.push({
      tone: 'upcoming',
      text: `A principal payment of ${fmtCurrency(debtTotals.nextPlanned.plannedPrincipalAmount)} is planned for ${debtTotals.nextPlanned.plannedDate}.`,
    });
  }

  const topCategory = totals.spendingByCategory[0];
  if (topCategory && totals.totalSpending > 0) {
    const share = Math.round((topCategory.amount / totals.totalSpending) * 100);
    if (share >= 40) {
      tips.push({ tone: 'safe', text: `${topCategory.name} makes up ${share}% of this month's spending so far.` });
    }
  }

  if (tips.length === 0) {
    tips.push({ tone: 'safe', text: 'Nothing urgent right now — keep logging income and expenses for sharper suggestions here.' });
  }

  return tips.slice(0, 4);
}

function DashboardPage({ colors, now, financial, immigration, setPage }) {
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const { totals, debtTotals } = financial;
  const { visas, ninetyDayReports, passports } = immigration;
  const suggestions = buildSuggestions({ totals, visas, ninetyDayReports, passports, debtTotals, now });

  const nearestVisa = visas.length > 0
    ? [...visas].sort((a, b) => diffDays(a.expirationDate, now) - diffDays(b.expirationDate, now))[0]
    : null;
  const nearestVisaStatus = nearestVisa ? visaStatus(nearestVisa.expirationDate, now) : null;

  const activeReports = ninetyDayReports.filter((r) => !r.completed);
  const nearestReport = activeReports.length > 0
    ? [...activeReports].sort((a, b) => diffDays(a.nextDueDate, now) - diffDays(b.nextDueDate, now))[0]
    : null;
  const nearestReportStatus = nearestReport ? ninetyDayStatus(nearestReport.nextDueDate, now) : null;

  const nearestPassport = passports.length > 0
    ? [...passports].sort((a, b) => diffDays(a.expirationDate, now) - diffDays(b.expirationDate, now))[0]
    : null;
  const nearestPassportStatus = nearestPassport ? passportStatus(nearestPassport.expirationDate, now) : null;

  return (
    <div style={{ padding: '28px 24px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: 16, padding: '24px 26px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
        flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{
            fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 500,
            fontSize: 26, color: colors.textPrimary, margin: 0,
          }}>
            {greeting}, Miki
          </h1>
          <p style={{ color: colors.textSecondary, fontSize: 14, margin: '6px 0 0' }}>
            Here's what's happening in your life today.
          </p>
          <p style={{ color: colors.textFaint, fontSize: 12, margin: '10px 0 0' }}>
            {dateStr}
          </p>
        </div>
        <DayRing now={now} colors={colors} />
      </div>

      <div>
        <DashboardSectionLabel colors={colors}>
          <span>Financial overview</span>
          <DashboardLink colors={colors} onClick={() => setPage('financial')}>View Financial</DashboardLink>
        </DashboardSectionLabel>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <SummaryCard colors={colors} icon={Scale} label="Available to spend" value={fmtCurrency(totals.spendableMoney)} tone="accent" sub="Cash + bank − unpaid obligations" />
          <SummaryCard colors={colors} icon={TrendingUp} label="Income this month" value={fmtCurrency(totals.totalIncome)} tone="safe" />
          <SummaryCard colors={colors} icon={TrendingDown} label="Spent this month" value={fmtCurrency(totals.totalSpending)} tone="urgent" />
          <SummaryCard colors={colors} icon={Banknote} label="Daily guide" value={fmtCurrency(totals.dailyGuide)} tone="upcoming" sub={`Based on ${totals.remainingDays} days left`} />
        </div>
        {debtTotals.totalOriginal > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <SummaryCard colors={colors} icon={CreditCard} label="To pay off this month" value={fmtCurrency(debtTotals.shortTermOutstanding)} tone="urgent" sub="Short-term loans" />
            <SummaryCard colors={colors} icon={CreditCard} label="Total debt" value={fmtCurrency(debtTotals.totalOutstanding)} tone="upcoming" sub={`${debtTotals.percentPaid.toFixed(1)}% paid off`} />
            <SummaryCard colors={colors} icon={TrendingUp} label="Interest due this month" value={fmtCurrency(debtTotals.monthlyInterestDue)} tone="upcoming" />
            {debtTotals.nextPlanned && (
              <SummaryCard
                colors={colors} icon={CalendarClock} label="Next principal payment"
                value={fmtCurrency(debtTotals.nextPlanned.plannedPrincipalAmount)}
                tone="accent" sub={debtTotals.nextPlanned.plannedDate}
              />
            )}
          </div>
        )}
      </div>

      <div>
        <DashboardSectionLabel colors={colors}>
          <span>Life admin</span>
          <DashboardLink colors={colors} onClick={() => setPage('immigration')}>View Immigration</DashboardLink>
        </DashboardSectionLabel>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ImmigrationSummaryCard
            colors={colors} icon={BadgeCheck} label="Visa"
            empty={!nearestVisa}
            person={nearestVisa ? `${USERS.find((u) => u.id === nearestVisa.personId)?.name}'s ${nearestVisa.visaType}` : ''}
            sub={nearestVisaStatus ? fmtDaysLeft(nearestVisaStatus.daysLeft) : ''}
            tone={nearestVisaStatus?.tone}
          />
          <ImmigrationSummaryCard
            colors={colors} icon={CalendarDays} label="90-Day Report"
            empty={!nearestReport}
            person={nearestReport ? `${USERS.find((u) => u.id === nearestReport.personId)?.name}'s next report` : ''}
            sub={nearestReportStatus ? fmtDaysLeft(nearestReportStatus.daysLeft) : ''}
            tone={nearestReportStatus?.tone}
          />
          <ImmigrationSummaryCard
            colors={colors} icon={Fingerprint} label="Passport"
            empty={!nearestPassport}
            person={nearestPassport ? `${USERS.find((u) => u.id === nearestPassport.personId)?.name}'s passport` : ''}
            sub={nearestPassportStatus ? fmtYearsMonths(nearestPassport.expirationDate, now) : ''}
            tone={nearestPassportStatus?.tone}
          />
        </div>
      </div>

      <div>
        <DashboardSectionLabel colors={colors}>
          <span>Upcoming</span>
        </DashboardSectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {Object.entries(PLACEHOLDER_COPY).map(([id, copy]) => {
            const Icon = copy.icon;
            return (
              <div
                key={id}
                style={{
                  border: `1px dashed ${colors.border}`, borderRadius: 14, padding: '16px 18px',
                  color: colors.textFaint, cursor: 'pointer',
                }}
                onClick={() => setPage(id)}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 9, background: colors.surfaceMuted, color: colors.textSecondary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                }}>
                  <Icon size={15} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.textPrimary }}>{copy.title}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{copy.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <DashboardSectionLabel colors={colors}>
          <span>✨ DailyOS suggestions</span>
        </DashboardSectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map((tip, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12,
                padding: '12px 14px', fontSize: 13, color: colors.textPrimary,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors[tip.tone] || colors.accent, flexShrink: 0 }} />
              {tip.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OccasionModal({ colors, onClose, onSave, initial, defaultDate }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || 'other');
  const [personId, setPersonId] = useState(initial?.personId || 'shared');
  const [startDate, setStartDate] = useState(initial?.startDate || defaultDate || monthKeyOf(new Date()) + '-01');
  const [isMultiDay, setIsMultiDay] = useState(!!initial?.endDate);
  const [endDate, setEndDate] = useState(initial?.endDate || '');
  const [hasTime, setHasTime] = useState(!!(initial?.startTime || initial?.endTime));
  const [startTime, setStartTime] = useState(initial?.startTime || '');
  const [endTime, setEndTime] = useState(initial?.endTime || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [recurrence, setRecurrence] = useState(initial?.recurrence || 'None');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});

  function handleSave() {
    const errs = {};
    if (!title.trim()) errs.title = 'Title is required.';
    if (!startDate) errs.startDate = 'Date is required.';
    if (isMultiDay && endDate && endDate < startDate) errs.endDate = 'End date must be on or after the start date.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      id: initial?.id || genId(),
      title: title.trim(), category, personId, startDate,
      endDate: isMultiDay && endDate ? endDate : null,
      startTime: hasTime && startTime ? startTime : null,
      endTime: hasTime && endTime ? endTime : null,
      location: location.trim(), recurrence, notes,
    });
  }

  return (
    <Modal colors={colors} onClose={onClose} title={initial ? 'Edit occasion' : 'Add occasion'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={fieldLabelStyle(colors)}>Title</label>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Alex & Miki's anniversary" style={fieldInputStyle(colors, errors.title)}
          />
          {errors.title && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.title}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldInputStyle(colors, false)}>
              {OCCASION_CATEGORIES.filter((c) => c.id !== 'immigration').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle(colors)}>Person</label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={fieldInputStyle(colors, false)}>
              {USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={fieldLabelStyle(colors)}>Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldInputStyle(colors, errors.startDate)} />
          {errors.startDate && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.startDate}</div>}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, cursor: 'pointer' }}>
          <input type="checkbox" checked={isMultiDay} onChange={(e) => setIsMultiDay(e.target.checked)} />
          Spans multiple days
        </label>
        {isMultiDay && (
          <div>
            <label style={fieldLabelStyle(colors)}>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={fieldInputStyle(colors, errors.endDate)} />
            {errors.endDate && <div style={{ fontSize: 11.5, color: colors.urgent, marginTop: 4 }}>{errors.endDate}</div>}
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary, cursor: 'pointer' }}>
          <input type="checkbox" checked={hasTime} onChange={(e) => setHasTime(e.target.checked)} />
          Has a specific time
        </label>
        {hasTime && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={fieldLabelStyle(colors)}>Start time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={fieldInputStyle(colors, false)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={fieldLabelStyle(colors)}>End time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={fieldInputStyle(colors, false)} />
            </div>
          </div>
        )}

        <div>
          <label style={fieldLabelStyle(colors)}>Location (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Asok Campus" style={fieldInputStyle(colors, false)} />
        </div>

        <div>
          <label style={fieldLabelStyle(colors)}>Repeats</label>
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={fieldInputStyle(colors, false)}>
            {OCCASION_RECURRENCES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 4 }}>
            "Monthly (last day)" always lands on the actual last calendar day, e.g. 28th in February, 30th in April.
          </div>
        </div>

        <div>
          <label style={fieldLabelStyle(colors)}>Notes (optional)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
          />
        </div>

        <button
          onClick={handleSave}
          style={{
            marginTop: 4, padding: '11px 0', borderRadius: 9, border: 'none',
            background: colors.textPrimary, color: colors.bg, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}
        >Save occasion</button>
      </div>
    </Modal>
  );
}

function OccasionRow({ colors, o, occurrenceDate, occurrenceEndDate, onEdit, onDelete, onSkipOccurrence }) {
  const [confirming, setConfirming] = useState(false);
  const isRecurring = o.recurrence && o.recurrence !== 'None';
  const info = occasionCategoryInfo(o.category);
  const toneColor = colors[info.tone] || colors.accent;
  const toneSoft = colors[`${info.tone}Soft`] || colors.accentSoft;
  const person = USERS.find((u) => u.id === o.personId)?.name || o.personId;

  const start = parseDateOnly(occurrenceDate);
  const dateLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const rangeLabel = occurrenceEndDate
    ? `${dateLabel} – ${parseDateOnly(occurrenceEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : dateLabel;
  const timeLabel = o.startTime ? `${o.startTime}${o.endTime ? ` – ${o.endTime}` : ''}` : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      padding: '12px 4px', borderBottom: `1px solid ${colors.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220, flex: '1 1 240px' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: toneColor, flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.textPrimary }}>{o.title}</div>
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>
            {info.label} · {person}{o.location ? ` · ${o.location}` : ''}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12.5, color: colors.textPrimary, fontWeight: 500 }}>{rangeLabel}</div>
        {timeLabel && <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 2 }}>{timeLabel}</div>}
        {isRecurring && (
          <div style={{ fontSize: 11, color: toneColor, marginTop: 2 }}>{o.recurrence}</div>
        )}
      </div>
      {o.virtual ? (
        <div style={{ fontSize: 11, color: colors.textFaint, fontStyle: 'italic' }}>From Immigration</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {confirming ? (
            isRecurring ? (
              <>
                <button
                  onClick={() => onSkipOccurrence(o.id, occurrenceDate)}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '6px 10px', borderRadius: 999, border: `1px solid ${colors.urgent}`, background: colors.urgentSoft, color: colors.urgent, cursor: 'pointer' }}
                >Skip this one</button>
                <button
                  onClick={() => onDelete(o.id)}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '6px 10px', borderRadius: 999, border: `1px solid ${colors.urgent}`, background: 'transparent', color: colors.urgent, cursor: 'pointer' }}
                >Delete entire series</button>
                <button
                  onClick={() => setConfirming(false)}
                  style={{ fontSize: 11.5, fontWeight: 500, padding: '6px 10px', borderRadius: 999, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }}
                >Cancel</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onDelete(o.id)}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '6px 10px', borderRadius: 999, border: `1px solid ${colors.urgent}`, background: colors.urgentSoft, color: colors.urgent, cursor: 'pointer' }}
                >Confirm delete</button>
                <button
                  onClick={() => setConfirming(false)}
                  style={{ fontSize: 11.5, fontWeight: 500, padding: '6px 10px', borderRadius: 999, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }}
                >Cancel</button>
              </>
            )
          ) : (
            <>
              <button
                onClick={() => onEdit(o)} aria-label="Edit"
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }}
              ><Pencil size={13} /></button>
              <button
                onClick={() => setConfirming(true)} aria-label="Delete"
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }}
              ><Trash2 size={13} /></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OccasionsPage({ colors, occasions, setOccasions, immigration, now }) {
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(now));
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(now));
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(''), 2200);
  }
  function handleSave(record) {
    setOccasions((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [...prev, record];
    });
    setModalOpen(false);
    setEditRecord(null);
    showToast(editRecord ? 'Occasion updated' : 'Occasion added');
  }
  function handleDelete(id) {
    setOccasions((prev) => prev.filter((r) => r.id !== id));
    showToast('Occasion deleted');
  }
  function handleSkipOccurrence(id, occurrenceDate) {
    setOccasions((prev) => prev.map((r) => (r.id === id ? {
      ...r,
      skipDates: [...(r.skipDates || []), occurrenceDate],
    } : r)));
    showToast('That occurrence was skipped');
  }

  const gridDays = useMemo(() => occasionsCalendarGridDays(monthKey), [monthKey]);
  const rangeStart = toDateStr(gridDays[0]);
  const rangeEnd = toDateStr(gridDays[gridDays.length - 1]);

  const allOccasions = useMemo(
    () => [...occasions, ...deriveImmigrationOccasions(immigration)],
    [occasions, immigration]
  );

  // Map of 'YYYY-MM-DD' -> array of { occasion, occurrenceDate, occurrenceEndDate }
  const dayMap = useMemo(() => {
    const map = new Map();
    for (const o of allOccasions) {
      const occurrences = occasionOccurrencesInRange(o, rangeStart, rangeEnd);
      for (const occ of occurrences) {
        const spanEnd = occ.endDate || occ.date;
        let cursor = occ.date;
        while (cursor <= spanEnd) {
          if (cursor >= rangeStart && cursor <= rangeEnd) {
            if (!map.has(cursor)) map.set(cursor, []);
            map.get(cursor).push({ occasion: o, occurrenceDate: occ.date, occurrenceEndDate: occ.endDate });
          }
          cursor = addDays(cursor, 1);
        }
      }
    }
    return map;
  }, [allOccasions, rangeStart, rangeEnd]);

  const todayStr = toDateStr(now);
  const selectedEntries = (dayMap.get(selectedDate) || []).sort((a, b) => a.occasion.title.localeCompare(b.occasion.title));

  // Upcoming: next 8 occurrences from today across the next 180 days.
  const upcoming = useMemo(() => {
    const horizonEnd = addDays(todayStr, 180);
    const results = [];
    for (const o of allOccasions) {
      for (const occ of occasionOccurrencesInRange(o, todayStr, horizonEnd)) {
        results.push({ occasion: o, occurrenceDate: occ.date, occurrenceEndDate: occ.endDate });
      }
    }
    results.sort((a, b) => (a.occurrenceDate < b.occurrenceDate ? -1 : a.occurrenceDate > b.occurrenceDate ? 1 : 0));
    return results.slice(0, 8);
  }, [allOccasions, todayStr]);

  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <MonthSelector colors={colors} monthKey={monthKey} setMonthKey={setMonthKey} />
        <button
          onClick={() => { setEditRecord(null); setModalOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add occasion
        </button>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: colors.textFaint, padding: '4px 0' }}>{w}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {gridDays.map((d) => {
            const dateStr = toDateStr(d);
            const inCurrentMonth = dateStr.slice(0, 7) === monthKey;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const entries = dayMap.get(dateStr) || [];
            const visible = entries.slice(0, 3);
            const overflow = entries.length - visible.length;
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                style={{
                  textAlign: 'left', minHeight: 74, padding: '6px 5px', borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${isSelected ? colors.accent : colors.border}`,
                  background: isSelected ? colors.accentSoft : colors.surface,
                  opacity: inCurrentMonth ? 1 : 0.45,
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}
              >
                <span style={{
                  fontSize: 11.5, fontWeight: isToday ? 700 : 500,
                  color: isToday ? colors.accent : colors.textPrimary,
                }}>{d.getDate()}</span>
                {visible.map((e, i) => {
                  const info = occasionCategoryInfo(e.occasion.category);
                  const toneColor = colors[info.tone] || colors.accent;
                  return (
                    <div key={i} style={{
                      fontSize: 9.5, fontWeight: 500, color: toneColor, background: colors[`${info.tone}Soft`] || colors.accentSoft,
                      borderRadius: 4, padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{e.occasion.title}</div>
                  );
                })}
                {overflow > 0 && (
                  <div style={{ fontSize: 9.5, color: colors.textFaint }}>+{overflow} more</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
          {parseDateOnly(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <div style={{ marginTop: 10 }}>
          {selectedEntries.length === 0 ? (
            <EmptyRow colors={colors} text="Nothing on the calendar for this day." />
          ) : (
            selectedEntries.map((e, i) => (
              <OccasionRow
                key={`${e.occasion.id}-${i}`} colors={colors} o={e.occasion}
                occurrenceDate={e.occurrenceDate} occurrenceEndDate={e.occurrenceEndDate}
                onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
                onDelete={handleDelete}
                onSkipOccurrence={handleSkipOccurrence}
              />
            ))
          )}
        </div>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '16px 18px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Upcoming</span>
        <div style={{ marginTop: 10 }}>
          {upcoming.length === 0 ? (
            <EmptyRow colors={colors} text="Nothing coming up in the next 180 days." />
          ) : (
            upcoming.map((e, i) => (
              <OccasionRow
                key={`${e.occasion.id}-${i}`} colors={colors} o={e.occasion}
                occurrenceDate={e.occurrenceDate} occurrenceEndDate={e.occurrenceEndDate}
                onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
                onDelete={handleDelete}
                onSkipOccurrence={handleSkipOccurrence}
              />
            ))
          )}
        </div>
      </div>

      {modalOpen && (
        <OccasionModal
          colors={colors} initial={editRecord} defaultDate={selectedDate}
          onClose={() => { setModalOpen(false); setEditRecord(null); }}
          onSave={handleSave}
        />
      )}
      <Toast colors={colors} text={toast} />
    </div>
  );
}

function QRCodePage({ colors }) {
  const [text, setText] = useState('');
  const [size, setSize] = useState(512);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const value = text.trim();
    if (!value) {
      setQrDataUrl('');
      setError('');
      return;
    }
    let cancelled = false;
    setGenerating(true);
    const t = setTimeout(() => {
      QRCode.toDataURL(value, {
        width: size, margin: 2,
        color: { dark: '#1A1A1A', light: '#FFFFFF' },
      })
        .then((url) => {
          if (cancelled) return;
          setQrDataUrl(url);
          setError('');
        })
        .catch((err) => {
          if (cancelled) return;
          setQrDataUrl('');
          setError(err?.message === 'The amount of data is too big to be stored in a QR Code'
            ? 'That text is too long to fit in a QR code. Try a shorter link.'
            : 'Could not generate a QR code for that input.');
        })
        .finally(() => { if (!cancelled) setGenerating(false); });
    }, 250); // small debounce so it doesn't regenerate on every keystroke
    return () => { cancelled = true; clearTimeout(t); };
  }, [text, size]);

  function handleDownload() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'qr-code.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 480 }}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '18px 20px' }}>
        <label style={fieldLabelStyle(colors)}>Link or text</label>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={3}
          placeholder="https://example.com"
          style={{ ...fieldInputStyle(colors, false), resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
        />
        <div style={{ marginTop: 12 }}>
          <label style={fieldLabelStyle(colors)}>Size</label>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))} style={fieldInputStyle(colors, false)}>
            <option value={256}>Small (256×256)</option>
            <option value={512}>Medium (512×512)</option>
            <option value={1024}>Large (1024×1024)</option>
          </select>
        </div>
      </div>

      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: '24px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minHeight: 260, justifyContent: 'center',
      }}>
        {error && (
          <div style={{ fontSize: 12.5, color: colors.urgent, textAlign: 'center' }}>{error}</div>
        )}
        {!error && !qrDataUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: colors.textFaint }}>
            <QrCode size={32} />
            <span style={{ fontSize: 12.5 }}>{generating ? 'Generating…' : 'Enter a link or text above to generate a QR code.'}</span>
          </div>
        )}
        {qrDataUrl && (
          <>
            <img
              src={qrDataUrl} alt="Generated QR code"
              style={{ width: 220, height: 220, borderRadius: 8, border: `1px solid ${colors.border}`, background: '#FFFFFF' }}
            />
            <button
              onClick={handleDownload}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
                border: 'none', background: colors.accent, color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Download size={14} /> Download PNG
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DailyOSApp() {
  const [stage, setStage] = useState('welcome');
  const [page, setPage] = useState('dashboard');
  const [isDark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const now = useClock();

  const [incomes, setIncomes, incomesLoaded] = useSyncedCollection('incomes');
  const [expenses, setExpenses, expensesLoaded] = useSyncedCollection('expenses');
  const [obligations, setObligations, obligationsLoaded] = useSyncedCollection('obligations');
  const [categories, setCategories, categoriesLoaded] = useSyncedCollection('categories');
  const [balances, setBalances, balancesLoaded] = useSyncedBalances();
  const [debts, setDebts, debtsLoaded] = useSyncedCollection('debts');
  const [debtPayments, setDebtPayments, debtPaymentsLoaded] = useSyncedCollection('debt_payments');
  const [plannedDebtPayments, setPlannedDebtPayments, plannedDebtLoaded] = useSyncedCollection('planned_debt_payments');
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(now));

  const totals = useFinancialTotals({ incomes, expenses, obligations, balances, categories, monthKey, now });
  const debtTotals = useDebtTotals({ debts, debtPayments, plannedDebtPayments, monthKey });
  const financial = {
    incomes, setIncomes, expenses, setExpenses, obligations, setObligations,
    categories, setCategories, balances, setBalances, monthKey, setMonthKey, totals,
    debts, setDebts, debtPayments, setDebtPayments, plannedDebtPayments, setPlannedDebtPayments, debtTotals,
  };

  const [visas, setVisas, visasLoaded] = useSyncedCollection('visas');
  const [ninetyDayReports, setNinetyDayReports, reportsLoaded] = useSyncedCollection('ninety_day_reports');
  const [passports, setPassports, passportsLoaded] = useSyncedCollection('passports');
  const immigration = { visas, setVisas, ninetyDayReports, setNinetyDayReports, passports, setPassports };

  const [occasions, setOccasions, occasionsLoaded] = useSyncedCollection('occasions');

  const colors = useMemo(() => (isDark ? dark : light), [isDark]);
  const currentTitle = NAV_ITEMS.find((n) => n.id === page)?.label || 'Dashboard';

  const dataLoaded = incomesLoaded && expensesLoaded && obligationsLoaded && categoriesLoaded
    && balancesLoaded && visasLoaded && reportsLoaded && passportsLoaded
    && debtsLoaded && debtPaymentsLoaded && plannedDebtLoaded && occasionsLoaded;

  const notifications = useMemo(
    () => (dataLoaded ? computeNotifications(immigration, occasions, now) : []),
    [dataLoaded, immigration, occasions, now]
  );
    
  // Auto-record monthly commitments as expenses once their payment day
  // arrives, so rent/allowance/internet etc. don't need to be entered
  // twice. There's no backend cron here (this is a static site), so this
  // runs as a practical equivalent: the moment the app is open on or after
  // the payment day, and it hasn't already been recorded for this month.
  // This intentionally also backfills: if a commitment is added with a
  // payment day already in the past for the current month, it records
  // immediately for this month too. paidMonths/linkedExpenses are kept
  // purely as internal bookkeeping to avoid double-recording the same
  // month, they're not shown as a "paid" status anywhere in the UI.
  const autoPaidRef = useRef(new Set());
  useEffect(() => {
    if (!dataLoaded) return;
    const currentMonthKey = monthKeyOf(now);

    obligations.forEach((o) => {
      if (o.active === false) return;
      if (o.frequency !== 'Monthly') return;
      if (!obligationAppliesToMonth(o, currentMonthKey)) return;

      const paidMonths = o.paidMonths || [];
      if (paidMonths.includes(currentMonthKey)) return;

      const dueDateStr = dueDateForMonth(o, currentMonthKey);
      if (diffDays(dueDateStr, now) > 0) return; // payment day hasn't arrived yet this month

      const sessionKey = `${o.id}:${currentMonthKey}`;
      if (autoPaidRef.current.has(sessionKey)) return;
      autoPaidRef.current.add(sessionKey);

      const expenseId = genId();
      setExpenses((prev) => [...prev, {
        id: expenseId, personId: o.personId, categoryId: o.categoryId,
        amount: o.amount, date: dueDateStr, paymentMethod: 'Bank',
        notes: `Auto-recorded from commitment: ${o.name}`,
      }]);
      setObligations((prev) => prev.map((item) => (item.id === o.id ? {
        ...item,
        paidMonths: [...(item.paidMonths || []), currentMonthKey],
        linkedExpenses: [...(item.linkedExpenses || []), { monthKey: currentMonthKey, expenseId }],
      } : item)));
    });
  }, [dataLoaded, obligations, monthKeyOf(now)]);

  if (stage === 'welcome') {
    return <WelcomeScreen colors={colors} dark={isDark} onEnter={() => setStage('app')} />;
  }

  if (!dataLoaded) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: colors.bg, color: colors.textFaint, fontFamily: 'Inter, sans-serif', fontSize: 13,
      }}>
        Loading your data…
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: 640, background: colors.bg, fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        ${FONT_IMPORT}
        .dailyos-shell { display: flex; min-height: 640px; }
        .dailyos-sidebar { width: 240px; border-right: 1px solid ${colors.border}; flex-shrink: 0; background: ${colors.bg}; }
        .dailyos-main { flex: 1; min-width: 0; }
        .mobile-menu-btn { display: none; }
        .mobile-scrim { display: none; }
        @media (max-width: 760px) {
          .dailyos-sidebar { display: none; }
          .mobile-menu-btn { display: flex !important; }
          .dailyos-mobile-sidebar { display: block; position: fixed; top: 0; left: 0; bottom: 0; width: 250px; z-index: 40; background: ${colors.bg}; border-right: 1px solid ${colors.border}; }
          .mobile-scrim.open { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 30; }
        }
      `}</style>

      <div className="dailyos-shell">
        <aside className="dailyos-sidebar">
          <SidebarContent colors={colors} page={page} setPage={setPage} dark={isDark} setDark={setDark} />
        </aside>

        {mobileOpen && (
          <div className="mobile-scrim open" onClick={() => setMobileOpen(false)} />
        )}
        {mobileOpen && (
          <div className="dailyos-mobile-sidebar">
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 14px 0' }}>
              <button
                onClick={() => setMobileOpen(false)}
                style={{ border: 'none', background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarContent
              colors={colors} page={page} setPage={setPage} dark={isDark} setDark={setDark}
              closeMobile={() => setMobileOpen(false)}
            />
          </div>
        )}

        <main className="dailyos-main">
          <TopBar
            colors={colors} title={currentTitle}
            onMenu={() => setMobileOpen(true)}
            notifOpen={notifOpen} setNotifOpen={setNotifOpen}
            notifications={notifications}
          />
          {page === 'dashboard' && (
            <DashboardPage colors={colors} now={now} financial={financial} immigration={immigration} setPage={setPage} />
          )}
          {page === 'financial' && <FinancialPage colors={colors} financial={financial} now={now} />}
          {page === 'immigration' && <ImmigrationPage colors={colors} immigration={immigration} now={now} />}
          {page === 'occasions' && <OccasionsPage colors={colors} occasions={occasions} setOccasions={setOccasions} immigration={immigration} now={now} />}
          {page === 'qrcode' && <QRCodePage colors={colors} />}
          {page !== 'dashboard' && page !== 'financial' && page !== 'immigration' && page !== 'occasions' && page !== 'qrcode' && <PlaceholderPage colors={colors} page={page} />}
        </main>
      </div>
    </div>
  );
}

export default function DailyOS() {
  return (
    <LoginGate>
      <DailyOSApp />
    </LoginGate>
  );
}
