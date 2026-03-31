import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../api';

export function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await register({ username, password });
      navigate('/characters');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Reino del Umbral</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <h2>Registro</h2>
        {error && <p style={styles.error}>{error}</p>}
        <input
          type="text"
          placeholder="Usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={styles.input}
          autoFocus
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />
        <input
          type="password"
          placeholder="Confirmar contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
        <p style={styles.link}>
          ¿Ya tenés cuenta? <Link to="/login" style={styles.a}>Iniciá sesión</Link>
        </p>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', background: '#1a1a2e', color: '#e0c097',
  },
  title: { fontSize: '2.5rem', marginBottom: '2rem' },
  form: {
    display: 'flex', flexDirection: 'column', gap: '1rem',
    background: '#16213e', padding: '2rem', borderRadius: '8px', minWidth: '320px',
  },
  input: {
    padding: '0.75rem', borderRadius: '4px', border: '1px solid #333',
    background: '#0f3460', color: '#eee', fontSize: '1rem',
  },
  button: {
    padding: '0.75rem', borderRadius: '4px', border: 'none',
    background: '#e94560', color: '#fff', fontSize: '1rem', cursor: 'pointer',
  },
  error: { color: '#e94560', margin: 0 },
  link: { textAlign: 'center', fontSize: '0.9rem' },
  a: { color: '#53a8b6' },
};
