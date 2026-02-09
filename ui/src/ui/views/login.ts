import { html, nothing } from "lit";

export type LoginProps = {
  loading: boolean;
  error: string | null;
  phone: string;
  onPhoneChange: (phone: string) => void;
  onLogin: () => void;
};

export function renderLogin(props: LoginProps) {
  const { loading, error, phone, onPhoneChange, onLogin } = props;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !loading && phone.trim()) {
      onLogin();
    }
  };

  const handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    onPhoneChange(input.value);
  };

  return html`
    <div class="login-page">
      <div class="login-content">
        <div class="login-logo">
          <img src="/favicon.svg" alt="OpenClaw" />
        </div>
        
        <h1 class="login-title">OPENCLAW</h1>
        <p class="login-subtitle">GATEWAY DASHBOARD</p>

        ${
          error
            ? html`<div class="login-error">
              <svg class="login-error-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
              </svg>
              <span>${error}</span>
            </div>`
            : nothing
        }

        <div class="login-form">
          <div class="login-input-group">
            <label class="login-label" for="phone-input">手机号</label>
            <input
              id="phone-input"
              class="login-input"
              type="tel"
              inputmode="numeric"
              maxlength="11"
              placeholder="请输入手机号"
              .value=${phone}
              @input=${handleInput}
              @keydown=${handleKeyDown}
              ?disabled=${loading}
              autofocus
            />
          </div>

          <button
            class="login-btn"
            ?disabled=${loading || !phone.trim()}
            @click=${onLogin}
          >
            ${
              loading
                ? html`
                    <span class="login-spinner"></span>
                  `
                : html`
                    <svg class="login-btn-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  `
            }
            <span>${loading ? "登录中..." : "登录"}</span>
          </button>
        </div>

        <div class="login-footer">
          <p class="login-hint">
            使用手机号登录，支持多用户
          </p>
        </div>
      </div>
    </div>

    <style>
      .login-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: var(--bg);
        padding: 24px;
      }

      .login-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 320px;
      }

      .login-logo {
        width: 64px;
        height: 64px;
        margin-bottom: 24px;
      }

      .login-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .login-title {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 0.1em;
        color: var(--text-strong);
        margin: 0 0 4px;
      }

      .login-subtitle {
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.08em;
        color: var(--muted);
        margin: 0 0 40px;
      }

      .login-error {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 12px 14px;
        margin-bottom: 20px;
        background: var(--danger-subtle);
        border: 1px solid var(--danger-muted);
        border-radius: var(--radius-md);
        color: var(--danger);
        font-size: 13px;
      }

      .login-error-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .login-form {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .login-input-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .login-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text);
      }

      .login-input {
        width: 100%;
        padding: 10px 14px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text-strong);
        font-size: 15px;
        font-family: inherit;
        letter-spacing: 0.05em;
        outline: none;
        transition: border-color var(--duration-fast) var(--ease-out);
        box-sizing: border-box;
      }

      .login-input::placeholder {
        color: var(--muted);
      }

      .login-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent-subtle, rgba(59, 130, 246, 0.15));
      }

      .login-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .login-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 12px 20px;
        background: var(--accent);
        border: none;
        border-radius: var(--radius-md);
        color: var(--accent-foreground);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .login-btn:hover:not(:disabled) {
        background: var(--accent-hover);
      }

      .login-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .login-btn:focus-visible {
        box-shadow: var(--focus-ring);
      }

      .login-btn-icon {
        width: 16px;
        height: 16px;
      }

      .login-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .login-footer {
        margin-top: 32px;
        text-align: center;
      }

      .login-hint {
        font-size: 12px;
        color: var(--muted);
        margin: 0;
      }
    </style>
  `;
}
