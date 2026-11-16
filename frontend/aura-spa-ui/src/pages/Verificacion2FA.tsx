import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../services/apiClient';

const Verificacion2FA: React.FC = () => {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const [codigo,  setCodigo]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const cajasRef = useRef<Array<HTMLInputElement | null>>([]);

  const [qrUrl, setQrUrl] = useState('');
  const [loadingQr, setLoadingQr] = useState(true);
  const [qrError, setQrError] = useState('');

  // Recuperar los datos guardados temporalmente en sesión
  const tokenTemp  = sessionStorage.getItem('aura_2fa_token');
  const userTemp   = sessionStorage.getItem('aura_2fa_usuario');
  // 'configurar' = primer login, se muestra el QR para activar 2FA.
  // 'verificar'  = la cuenta ya tiene 2FA activo, solo se pide el código (sin QR).
  const modo = sessionStorage.getItem('aura_2fa_modo') || 'configurar';
  const esConfiguracion = modo === 'configurar';

  useEffect(() => {
    if (!tokenTemp || !esConfiguracion) { setLoadingQr(false); return; }
    apiClient.get('/api/auth/2fa/setup', { headers: { Authorization: `Bearer ${tokenTemp}` } })
      .then(res => setQrUrl(res.data.url))
      .catch(() => setQrError('No se pudo generar el código QR. Intenta de nuevo más tarde.'))
      .finally(() => setLoadingQr(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.length !== 6) { setError('El código debe tener 6 dígitos.'); return; }
    if (!tokenTemp || !userTemp) { setError('Sesión expirada. Inicia sesión de nuevo.'); return; }

    setLoading(true); setError('');
    try {
      await apiClient.post('/api/auth/2fa/verificar', { codigo }, { headers: { Authorization: `Bearer ${tokenTemp}` } });

      const usuario = JSON.parse(userTemp);
      sessionStorage.removeItem('aura_2fa_token');
      sessionStorage.removeItem('aura_2fa_usuario');
      sessionStorage.removeItem('aura_2fa_modo');
      sessionStorage.setItem('aura_cerro_sesion', '0');
      login(tokenTemp, usuario);
      if (usuario.contrasenaProvisional) {
        navigate('/perfil', { state: { forzarCambioPassword: true } });
        return;
      }
      const p = usuario.perfil;
      navigate(['Admin','Cajero','Especialista'].includes(p) ? '/dashboard/staff' : '/dashboard/client');
    } catch (err: any) {
      const msg = err.response?.data;
      setError(typeof msg === 'string' ? msg : 'Código incorrecto. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Cada recuadro acepta un solo dígito; al escribir, el foco avanza automáticamente.
  const handleCajaChange = (indice: number, valor: string) => {
    const digitos = valor.replace(/\D/g, '');
    if (!digitos) {
      // Se borró el dígito de esta caja
      const nuevo = codigo.slice(0, indice) + codigo.slice(indice + 1);
      setCodigo(nuevo);
      if (error) setError('');
      return;
    }
    // Toma el último dígito escrito (cubre el caso de pegar varios caracteres en una sola caja)
    const ultimo = digitos[digitos.length - 1];
    const nuevo = (codigo.slice(0, indice) + ultimo + codigo.slice(indice + 1)).slice(0, 6);
    setCodigo(nuevo);
    if (error) setError('');
    if (indice < 5) cajasRef.current[indice + 1]?.focus();
  };

  const handleCajaKeyDown = (indice: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codigo[indice] && indice > 0) {
      // Caja vacía + Backspace: retrocede y borra el dígito anterior
      const nuevo = codigo.slice(0, indice - 1) + codigo.slice(indice);
      setCodigo(nuevo);
      cajasRef.current[indice - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && indice > 0) {
      cajasRef.current[indice - 1]?.focus();
    } else if (e.key === 'ArrowRight' && indice < 5) {
      cajasRef.current[indice + 1]?.focus();
    }
  };

  const handlePegado = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pegado = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pegado) return;
    e.preventDefault();
    setCodigo(pegado);
    if (error) setError('');
    const siguiente = Math.min(pegado.length, 5);
    cajasRef.current[siguiente]?.focus();
  };

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'var(--aura-beige)', padding:'20px' }}>
      <div className="card-aura animate-fade-in" style={{ width:'100%', maxWidth:'480px', padding:'50px', borderRadius:'30px', textAlign:'center' }}>

        <div style={{ display:'flex', justifyContent:'center', marginBottom:'20px' }}>
          <div style={{ background:'#f0ecff', width:'70px', height:'70px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ShieldCheck size={34} color="var(--aura-lavender)" />
          </div>
        </div>

        <h2 style={{ color:'var(--aura-navy)', fontWeight:'bold', marginBottom:'8px' }}>
          Verificación en dos pasos
        </h2>
        <p style={{ color:'var(--aura-gray)', fontSize:'0.9rem', marginBottom:'24px' }}>
          {esConfiguracion
            ? 'Escanea este código con Google Authenticator y luego ingresa el código de 6 dígitos que genera.'
            : 'Ingresa el código de 6 dígitos que genera tu app autenticadora para completar el inicio de sesión.'}
        </p>

        {esConfiguracion && (
          <div style={{ display:'flex', justifyContent:'center', marginBottom:'24px' }}>
            {loadingQr ? (
              <div style={{ width:'180px', height:'180px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Loader2 className="animate-spin" size={28} color="var(--aura-lavender)" />
              </div>
            ) : qrError ? (
              <div style={{ background:'#ffebee', color:'#c62828', padding:'13px', borderRadius:'14px', fontSize:'0.85rem' }}>
                {qrError}
              </div>
            ) : qrUrl ? (
              <div style={{ padding:'16px', background:'#ffffff', borderRadius:'16px', border:'1px solid #eee' }}>
                <QRCodeSVG value={qrUrl} size={180} />
              </div>
            ) : null}
          </div>
        )}

        {error && (
          <div style={{ background:'#ffebee', color:'#c62828', padding:'13px', borderRadius:'14px', marginBottom:'20px', fontSize:'0.88rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 6 recuadros individuales, estilo bancario — un dígito por caja */}
          <div style={{ display:'flex', gap:'10px', justifyContent:'center', marginBottom:'28px' }}>
            {Array.from({length:6}).map((_,i) => (
              <input
                key={i}
                ref={el => { cajasRef.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                autoFocus={i === 0}
                value={codigo[i] || ''}
                onChange={e => handleCajaChange(i, e.target.value)}
                onKeyDown={e => handleCajaKeyDown(i, e)}
                onPaste={handlePegado}
                style={{
                  width:'60px', height:'60px', textAlign:'center', fontSize:'1.5rem', fontWeight:'bold',
                  borderRadius:'12px', border:`2px solid ${codigo[i] ? 'var(--aura-lavender)' : '#ddd'}`,
                  outline:'none', background: codigo[i] ? '#f0ecff' : '#fcfcfc', color:'var(--aura-navy)'
                }}/>
            ))}
          </div>

          <button type="submit" className="btn-AuraSpa" style={{ width:'100%', padding:'15px', fontSize:'1.05rem' }} disabled={loading || codigo.length !== 6}>
            {loading ? <Loader2 className="animate-spin" size={22} style={{ margin:'0 auto', display:'block' }}/> : 'Verificar'}
          </button>
        </form>

        <p style={{ marginTop:'20px', fontSize:'0.82rem', color:'#aaa' }}>
          ¿Problemas?{' '}
          <span onClick={() => navigate('/login')} style={{ color:'var(--aura-lavender)', cursor:'pointer', fontWeight:'600' }}>
            Volver al inicio
          </span>
        </p>
      </div>
    </div>
  );
};

export default Verificacion2FA;
