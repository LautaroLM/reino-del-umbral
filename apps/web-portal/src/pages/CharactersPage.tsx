import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CharacterSummary, Race, CharacterClass } from '@ao/shared-types';
import {
  CHARACTER_APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE_PRESET_BY_CLASS,
} from '@ao/shared-constants';
import {
  listCharacters,
  createCharacter,
  deleteCharacter,
  selectCharacter,
  isLoggedIn,
  getAccount,
  logout,
} from '../api';

const RACES: { value: Race; label: string }[] = [
  { value: 'human', label: 'Humano' },
  { value: 'elf', label: 'Elfo' },
  { value: 'dwarf', label: 'Enano' },
  { value: 'nomad', label: 'Nómade' },
];

const CLASSES: { value: CharacterClass; label: string }[] = [
  { value: 'warrior', label: 'Guerrero' },
  { value: 'mage', label: 'Mago' },
  { value: 'explorer', label: 'Explorador' },
];

export function CharactersPage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [race, setRace] = useState<Race>('human');
  const [charClass, setCharClass] = useState<CharacterClass>('warrior');
  const [appearancePresetId, setAppearancePresetId] = useState<string>(DEFAULT_APPEARANCE_PRESET_BY_CLASS.warrior);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const account = getAccount();

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/login', { replace: true });
      return;
    }
    loadCharacters();
  }, []);

  useEffect(() => {
    setAppearancePresetId(DEFAULT_APPEARANCE_PRESET_BY_CLASS[charClass]);
  }, [charClass]);

  async function loadCharacters() {
    try {
      const chars = await listCharacters();
      setCharacters(chars);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const preset = CHARACTER_APPEARANCE_PRESETS.find((candidate) => candidate.id === appearancePresetId)
        ?? CHARACTER_APPEARANCE_PRESETS[0];
      await createCharacter({
        name,
        race,
        characterClass: charClass,
        idBody: preset.idBody,
        idHead: preset.idHead,
        idHelmet: preset.idHelmet,
      });
      setName('');
      setRace('human');
      setCharClass('warrior');
      setAppearancePresetId(DEFAULT_APPEARANCE_PRESET_BY_CLASS.warrior);
      setShowCreate(false);
      await loadCharacters();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteCharacter(id);
      await loadCharacters();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleSelect(char: CharacterSummary) {
    selectCharacter(char);
    navigate('/play');
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Personajes</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>{account?.username}</span>
          <button onClick={handleLogout} style={styles.smallBtn}>Salir</button>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <>
          <div style={styles.list}>
            {characters.map((char) => (
              <div key={char.id} style={styles.card}>
                <div>
                  <strong>{char.name}</strong>
                  <p style={styles.meta}>
                    {RACES.find((r) => r.value === char.race)?.label} —{' '}
                    {CLASSES.find((c) => c.value === char.characterClass)?.label} — Nivel {char.level}
                  </p>
                  <p style={styles.metaMuted}>
                    {CHARACTER_APPEARANCE_PRESETS.find(
                      (preset) => preset.idBody === char.idBody && preset.idHead === char.idHead && preset.idHelmet === char.idHelmet,
                    )?.label ?? 'Apariencia personalizada'}
                  </p>
                </div>
                <div style={styles.cardActions}>
                  <button onClick={() => handleSelect(char)} style={styles.playBtn}>Jugar</button>
                  <button onClick={() => handleDelete(char.id)} style={styles.deleteBtn}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {characters.length < 3 && !showCreate && (
            <button onClick={() => setShowCreate(true)} style={styles.createBtn}>
              + Crear personaje
            </button>
          )}

          {showCreate && (
            <form onSubmit={handleCreate} style={styles.form}>
              <h3>Nuevo personaje</h3>
              <input
                type="text"
                placeholder="Nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.input}
                autoFocus
              />
              <select value={race} onChange={(e) => setRace(e.target.value as Race)} style={styles.input}>
                {RACES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <select value={charClass} onChange={(e) => setCharClass(e.target.value as CharacterClass)} style={styles.input}>
                {CLASSES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select
                value={appearancePresetId}
                onChange={(e) => setAppearancePresetId(e.target.value)}
                style={styles.input}
              >
                {CHARACTER_APPEARANCE_PRESETS.filter((preset) => preset.characterClass === charClass).map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" style={styles.playBtn}>Crear</button>
                <button type="button" onClick={() => setShowCreate(false)} style={styles.smallBtn}>Cancelar</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '2rem', minHeight: '100vh', background: '#1a1a2e', color: '#e0c097',
    maxWidth: '600px', margin: '0 auto',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  title: { margin: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#16213e', padding: '1rem', borderRadius: '8px',
  },
  meta: { margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#aaa' },
  metaMuted: { margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#7ea1b5' },
  cardActions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  playBtn: {
    padding: '0.5rem 1rem', borderRadius: '4px', border: 'none',
    background: '#e94560', color: '#fff', cursor: 'pointer',
  },
  deleteBtn: {
    padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #555',
    background: 'transparent', color: '#e94560', cursor: 'pointer',
  },
  createBtn: {
    marginTop: '1rem', padding: '0.75rem', borderRadius: '4px', border: '1px dashed #555',
    background: 'transparent', color: '#53a8b6', cursor: 'pointer', width: '100%', fontSize: '1rem',
  },
  form: {
    marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
    background: '#16213e', padding: '1.5rem', borderRadius: '8px',
  },
  input: {
    padding: '0.75rem', borderRadius: '4px', border: '1px solid #333',
    background: '#0f3460', color: '#eee', fontSize: '1rem',
  },
  smallBtn: {
    padding: '0.4rem 0.75rem', borderRadius: '4px', border: '1px solid #555',
    background: 'transparent', color: '#aaa', cursor: 'pointer',
  },
  error: { color: '#e94560' },
};
