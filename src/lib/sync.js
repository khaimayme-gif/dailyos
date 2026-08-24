import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

function toSnakeKey(key) {
  return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}
function toCamelKey(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelToSnake(obj) {
  const out = {};
  for (const k of Object.keys(obj)) out[toSnakeKey(k)] = obj[k];
  return out;
}

const NUMERIC_KEYS = new Set(['amount', 'cash', 'bank']);

export function snakeToCamel(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    const camelKey = toCamelKey(k);
    out[camelKey] = NUMERIC_KEYS.has(camelKey) ? Number(obj[k]) : obj[k];
  }
  return out;
}

/**
 * Behaves like React's useState for an array of records with an `id` field,
 * except every setItems(prev => next) call is diffed against the previous
 * value and the differences (inserts/updates/deletes) are pushed to the
 * given Supabase table in the background. Existing components that already
 * call setX(updaterFn) need no changes.
 */
export function useSyncedCollection(table) {
  const [items, setItemsState] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from(table)
      .select('*')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(`[supabase] load ${table} failed`, err);
          setError(err);
          setLoaded(true);
          return;
        }
        setItemsState((data || []).map(snakeToCamel));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [table]);

  const setItems = useCallback(
    (updater) => {
      setItemsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        syncDiff(table, prev, next);
        return next;
      });
    },
    [table]
  );

  return [items, setItems, loaded, error];
}

function syncDiff(table, prev, next) {
  const prevById = new Map(prev.map((i) => [i.id, i]));
  const nextById = new Map(next.map((i) => [i.id, i]));

  for (const [id, item] of nextById) {
    const before = prevById.get(id);
    if (!before) {
      supabase
        .from(table)
        .insert(camelToSnake(item))
        .then(({ error }) => error && console.error(`[supabase] insert ${table} failed`, error));
    } else if (JSON.stringify(before) !== JSON.stringify(item)) {
      supabase
        .from(table)
        .update(camelToSnake(item))
        .eq('id', id)
        .then(({ error }) => error && console.error(`[supabase] update ${table} failed`, error));
    }
  }
  for (const [id] of prevById) {
    if (!nextById.has(id)) {
      supabase
        .from(table)
        .delete()
        .eq('id', id)
        .then(({ error }) => error && console.error(`[supabase] delete ${table} failed`, error));
    }
  }
}

/** Same idea as useSyncedCollection, but for the single-row `balances` table. */
export function useSyncedBalances() {
  const [balances, setBalancesState] = useState({ cash: 0, bank: 0 });
  const [loaded, setLoaded] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    supabase
      .from('balances')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[supabase] load balances failed', error);
        if (data) setBalancesState({ cash: Number(data.cash), bank: Number(data.bank) });
        loadedOnce.current = true;
        setLoaded(true);
      });
  }, []);

  const setBalances = useCallback((updater) => {
    setBalancesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (loadedOnce.current) {
        supabase
          .from('balances')
          .upsert({ id: 1, cash: next.cash, bank: next.bank })
          .then(({ error }) => error && console.error('[supabase] save balances failed', error));
      }
      return next;
    });
  }, []);

  return [balances, setBalances, loaded];
}
