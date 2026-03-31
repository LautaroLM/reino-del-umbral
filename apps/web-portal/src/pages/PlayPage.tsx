import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn, getToken, getSelectedCharacter } from '../api';

export function PlayPage() {
  const navigate = useNavigate();
  const character = getSelectedCharacter();
  const token = getToken();

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/login', { replace: true });
      return;
    }
    if (!character) {
      navigate('/characters', { replace: true });
      return;
    }
  }, []);

  if (!character || !token) return null;

  // Build query params for the game client
  const params = new URLSearchParams({
    token,
    characterId: String(character.id),
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Jugando como <strong>{character.name}</strong></span>
        <button onClick={() => navigate('/characters')} style={styles.backBtn}>
          Cambiar personaje
        </button>
      </div>
      <iframe
        src={`${import.meta.env.VITE_GAME_CLIENT_URL}/?${params.toString()}`}
        style={styles.iframe}
        title="Game Client"
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#111', color: '#e0c097',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.5rem 1rem', background: '#16213e',
  },
  backBtn: {
    padding: '0.4rem 0.75rem', borderRadius: '4px', border: '1px solid #555',
    background: 'transparent', color: '#aaa', cursor: 'pointer',
  },
  iframe: {
    flex: 1, border: 'none', width: '100%',
  },
};
