(function () {
  const authForm = document.getElementById('authForm');
  const signinTab = document.getElementById('signinTab');
  const signupTab = document.getElementById('signupTab');
  const nameField = document.getElementById('nameField');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submitBtn');
  const googleBtn = document.getElementById('googleBtn');
  const appleBtn = document.getElementById('appleBtn');
  const authStatus = document.getElementById('authStatus');
  const usernameHint = document.getElementById('usernameHint');

  const AUTH_STORAGE_KEY = 'campusflow_auth';
  let mode = 'signin';
  let googleClientId = '';
  let googleTokenClient = null;

  function apiBases() {
    const bases = [];
    // Always try current origin first (works for any backend port, e.g. 30000).
    bases.push('');
    bases.push('http://127.0.0.1:5000');
    bases.push('http://localhost:5000');
    if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      bases.push(`http://${window.location.hostname}:5000`);
    }
    return [...new Set(bases)];
  }

  async function fetchWithFallback(path, options) {
    let lastError = null;
    for (const base of apiBases()) {
      try {
        return await fetch(base + path, options);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Backend unreachable');
  }

  function setStatus(message, kind) {
    authStatus.textContent = message;
    authStatus.className = 'auth-status' + (kind ? ` ${kind}` : '');
  }

  function extractUsername(email) {
    return String(email || '').split('@')[0].trim().replace(/[^a-z0-9._-]/gi, '');
  }

  function titleCase(value) {
    return String(value || '')
      .replace(/[._-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Guest';
  }

  function persistProfile(payload) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  }

  function setButtonsDisabled(disabled) {
    submitBtn.disabled = disabled;
    googleBtn.disabled = disabled;
    appleBtn.disabled = disabled;
  }

  function updateUsernameHint() {
    const username = extractUsername(emailInput.value);
    if (!username) {
      usernameHint.textContent = 'Your dashboard username will appear here.';
      return;
    }
    usernameHint.textContent = `Dashboard username: ${titleCase(username)} (${username})`;
  }

  function setMode(nextMode) {
    mode = nextMode;
    signinTab.classList.toggle('active', mode === 'signin');
    signupTab.classList.toggle('active', mode === 'signup');
    nameField.classList.toggle('show', mode === 'signup');
    submitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
    passwordInput.placeholder = mode === 'signin' ? 'Enter password' : 'Create a password';
    passwordInput.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    setStatus(mode === 'signin'
      ? 'Use Google or Apple for the fastest login flow.'
      : 'Create your account, or use Google / Apple to continue instantly.');
  }

  function buildProfile(provider, email, fullName, accessToken, user) {
    const username = (user && user.username) || extractUsername(email);
    return {
      provider,
      email,
      username,
      full_name: (user && user.full_name) || fullName || titleCase(username),
      accessToken,
      userId: user && user.id,
      savedAt: new Date().toISOString()
    };
  }

  async function loadProviderConfig() {
    try {
      const resp = await fetchWithFallback('/api/v1/auth/providers');
      const data = await resp.json().catch(() => ({}));
      googleClientId = data?.data?.google?.clientId || '';

      if (!googleClientId) {
        googleBtn.title = 'Google OAuth client id not configured. Click will use direct social fallback.';
        setStatus('Google picker is not configured yet. You can still continue with Google using your email field.', 'error');
      }
    } catch (_err) {
      googleBtn.title = 'Cannot load Google login configuration. Click will use direct social fallback.';
      setStatus('Could not load Google OAuth config. Using fallback social sign-in.', 'error');
    }
  }

  function ensureGoogleTokenClient() {
    if (googleTokenClient) return googleTokenClient;
    if (!googleClientId) {
      setStatus('Google sign-in is not configured on backend yet.', 'error');
      return null;
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      setStatus('Google Sign-In script not loaded. Refresh and try again.', 'error');
      return null;
    }

    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'openid email profile',
      callback: async (tokenResponse) => {
        if (!tokenResponse || !tokenResponse.access_token) {
          setStatus('Google sign-in did not return an access token.', 'error');
          setButtonsDisabled(false);
          return;
        }

        try {
          const resp = await fetchWithFallback('/api/v1/auth/google-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: tokenResponse.access_token })
          });
          const data = await resp.json().catch(() => ({}));

          if (!resp.ok) {
            throw new Error(data.error || data.message || 'Google sign-in failed');
          }

          const user = data.data && data.data.user ? data.data.user : {};
          persistProfile(buildProfile('google', user.email, user.full_name, data.accessToken, user));
          setStatus(`Welcome ${user.username || extractUsername(user.email)}. Redirecting...`, 'ok');
          window.location.href = '/dashboard';
        } catch (err) {
          setStatus(err.message || 'Google authentication failed.', 'error');
          setButtonsDisabled(false);
        }
      }
    });

    return googleTokenClient;
  }

  async function performPasswordAuth(path, payload, successMessage) {
    const resp = await fetchWithFallback(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || data.message || 'Authentication failed');
    }

    const user = data.data && data.data.user ? data.data.user : {};
    persistProfile(buildProfile('email', user.email || payload.email, user.full_name || payload.full_name, data.accessToken, user));
    setStatus(successMessage, 'ok');
    window.location.href = '/dashboard';
  }

  async function performSocialAuth(provider) {
    const email = String(emailInput.value || '').trim().toLowerCase();
    const fullName = mode === 'signup' ? String(fullNameInput.value || '').trim() : '';

    if (!email) {
      setStatus('Enter your email first, then continue with Google or Apple.', 'error');
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    googleBtn.disabled = true;
    appleBtn.disabled = true;
    setStatus(`Signing in with ${provider === 'apple' ? 'Apple' : 'Google'}...`);

    try {
      const resp = await fetchWithFallback('/api/v1/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          full_name: fullName || titleCase(extractUsername(email)),
          provider
        })
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || data.message || 'Social sign-in failed');
      }

      const user = data.data && data.data.user ? data.data.user : {};
      persistProfile(buildProfile(provider, user.email || email, user.full_name || fullName, data.accessToken, user));
      setStatus(`Welcome back, ${extractUsername(email)}. Redirecting to your dashboard...`, 'ok');
      window.location.href = '/dashboard';
    } catch (err) {
      setStatus(err.message || 'Could not complete social sign-in.', 'error');
    } finally {
      submitBtn.disabled = false;
      googleBtn.disabled = false;
      appleBtn.disabled = false;
    }
  }

  function startGoogleOAuthFlow() {
    const client = ensureGoogleTokenClient();
    if (!client) {
      // Fallback so the button always performs a login action immediately.
      performSocialAuth('google');
      return;
    }

    setButtonsDisabled(true);
    setStatus('Opening Google account chooser...');
    client.requestAccessToken({ prompt: 'select_account' });
  }

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = String(emailInput.value || '').trim().toLowerCase();
    const password = String(passwordInput.value || '').trim();

    if (!email) {
      setStatus('Email is required.', 'error');
      emailInput.focus();
      return;
    }

    if (mode === 'signup') {
      const fullName = String(fullNameInput.value || '').trim();
      if (!fullName) {
        setStatus('Full name is required for sign up.', 'error');
        fullNameInput.focus();
        return;
      }
      if (!password) {
        setStatus('Password is required for sign up.', 'error');
        passwordInput.focus();
        return;
      }
      submitBtn.disabled = true;
      try {
        await performPasswordAuth('/api/v1/auth/signup', {
          email,
          password,
          full_name: fullName
        }, `Welcome, ${titleCase(extractUsername(email))}. Redirecting to your dashboard...`);
      } catch (err) {
        setStatus(err.message || 'Could not create your account.', 'error');
      } finally {
        submitBtn.disabled = false;
      }
      return;
    }

    if (!password) {
      setStatus('Password is required for sign in. Or use Google / Apple above.', 'error');
      passwordInput.focus();
      return;
    }

    submitBtn.disabled = true;
    try {
      await performPasswordAuth('/api/v1/auth/login', {
        email,
        password
      }, `Signed in as ${titleCase(extractUsername(email))}. Redirecting...`);
    } catch (err) {
      setStatus(err.message || 'Could not sign you in.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  signinTab.addEventListener('click', () => setMode('signin'));
  signupTab.addEventListener('click', () => setMode('signup'));
  googleBtn.addEventListener('click', () => startGoogleOAuthFlow());
  appleBtn.addEventListener('click', () => performSocialAuth('apple'));
  emailInput.addEventListener('input', updateUsernameHint);

  const stored = localStorage.getItem(AUTH_STORAGE_KEY);
  if (stored) {
    try {
      const profile = JSON.parse(stored);
      if (profile && profile.accessToken && profile.email) {
        window.location.replace('/dashboard');
        return;
      }
    } catch (_err) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  loadProviderConfig().finally(() => {
    setMode('signin');
    updateUsernameHint();
  });
})();
