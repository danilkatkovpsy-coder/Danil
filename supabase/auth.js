(() => {
  const config = window.GENERAR_SUPABASE_CONFIG;
  const root = document.createElement("main");
  root.id = "supabase-auth-root";
  root.innerHTML = `
    <div class="supabase-auth-shell">
      <header class="supabase-auth-header">
        <a class="supabase-auth-brand" href="#" aria-label="Arvesemu">
          <img src="images/logo.png?v=20261003-1" alt="">
          <span><strong>Arvesemu</strong><small data-auth-copy="brandSubtitle">Бухгалтерия компании</small></span>
        </a>
        <div class="supabase-auth-language" role="group" aria-label="Язык интерфейса">
          <button type="button" data-auth-language="et" aria-pressed="true">ET</button>
          <button type="button" data-auth-language="ru" aria-pressed="false">RU</button>
        </div>
      </header>
      <div class="supabase-auth-layout">
        <section class="supabase-auth-welcome" aria-labelledby="supabaseWelcomeTitle">
          <p class="supabase-auth-eyebrow" data-auth-copy="welcomeEyebrow">Arvesemu · учет компании</p>
          <h1 id="supabaseWelcomeTitle" data-auth-copy="welcomeTitle">Добро пожаловать</h1>
          <p class="supabase-auth-welcome-copy" data-auth-copy="welcomeDescription">Ведите клиентов, выставляйте счета и контролируйте операции компании в одном месте.</p>
          <p class="supabase-auth-welcome-note" data-auth-copy="welcomeNote">Войдите в аккаунт или начните с гостевого режима.</p>
        </section>
        <section class="supabase-auth-panel" aria-labelledby="supabaseAuthTitle">
          <h2 id="supabaseAuthTitle" data-auth-copy="signInTitle">Вход в аккаунт</h2>
          <div class="supabase-auth-tabs" role="group" aria-label="Авторизация">
            <button type="button" id="supabaseSignInTab" data-auth-copy="signInTab" hidden>Войти</button>
            <button type="button" id="supabaseSignUpTab" data-auth-copy="signUpTab">Регистрация</button>
            <button class="supabase-auth-forgot" id="supabaseForgotPassword" type="button" data-auth-copy="forgotPassword">Забыли пароль?</button>
          </div>
          <form id="supabaseAuthForm">
        <div class="supabase-auth-field">
          <label for="supabaseAuthEmail" data-auth-copy="email">Электронная почта</label>
          <input id="supabaseAuthEmail" type="email" autocomplete="email" required>
        </div>
        <div class="supabase-auth-field">
          <label for="supabaseAuthPassword" data-auth-copy="password">Пароль</label>
          <div class="supabase-auth-password-control">
            <input id="supabaseAuthPassword" type="password" minlength="8" autocomplete="current-password" required>
            <button class="supabase-password-toggle" id="supabasePasswordToggle" type="button" aria-label="Показать пароль" title="Показать пароль" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
          </div>
        </div>
        <div class="supabase-auth-field" id="supabaseSignupConfirmField" hidden>
          <label for="supabaseSignupConfirmPassword" data-auth-copy="confirmSignupPassword">Подтвердите пароль</label>
          <div class="supabase-auth-password-control">
            <input id="supabaseSignupConfirmPassword" type="password" minlength="8" autocomplete="off" required>
            <button class="supabase-password-toggle" id="supabaseConfirmPasswordToggle" type="button" aria-label="Показать пароль" title="Показать пароль" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
          </div>
        </div>
        <button class="supabase-auth-primary" id="supabaseAuthSubmit" type="submit"><svg class="supabase-auth-login-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"></path><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"></path></svg><span id="supabaseAuthSubmitLabel">Войти</span></button>
          </form>
      <div class="supabase-auth-divider" data-auth-copy="or">или</div>
      <button class="supabase-google-button" id="supabaseGoogleButton" type="button">
        <img class="supabase-google-mark" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="">
        <span data-auth-copy="googleAction">Продолжить с Google</span>
      </button>
      <button class="supabase-guest-button" id="supabaseGuestButton" type="button" data-auth-copy="guestAction" title="Демо-режим без аккаунта; данные останутся только в этом браузере">Войти как гость</button>
      <p class="supabase-auth-message" id="supabaseAuthMessage" role="status" aria-live="polite"></p>
      <section id="supabasePasswordResetRequestStage" hidden>
        <h1 data-auth-copy="resetPasswordTitle">Восстановление пароля</h1>
        <form id="supabasePasswordResetRequestForm">
          <div class="supabase-auth-field">
            <label for="supabaseResetEmail" data-auth-copy="email">Электронная почта</label>
            <input id="supabaseResetEmail" type="email" autocomplete="email" required>
          </div>
          <button class="supabase-auth-primary" id="supabaseResetEmailSubmit" type="submit" data-auth-copy="sendResetLink">Отправить ссылку</button>
          <button class="supabase-auth-forgot" id="supabaseResetBackToLogin" type="button" data-auth-copy="backToLogin">Назад ко входу</button>
        </form>
        <p class="supabase-auth-message" id="supabaseResetEmailMessage" role="status" aria-live="polite"></p>
      </section>
      <section id="supabasePasswordRecoveryStage" hidden>
        <h1 data-auth-copy="newPasswordTitle">Установить новый пароль</h1>
        <form id="supabasePasswordRecoveryForm">
          <div class="supabase-auth-field">
            <label for="supabaseNewPassword" data-auth-copy="newPassword">Новый пароль</label>
            <input id="supabaseNewPassword" type="password" minlength="8" autocomplete="off" required>
          </div>
          <div class="supabase-auth-field">
            <label for="supabaseConfirmPassword" data-auth-copy="confirmPassword">Повторите новый пароль</label>
            <input id="supabaseConfirmPassword" type="password" minlength="8" autocomplete="off" required>
          </div>
          <button class="supabase-auth-primary" id="supabasePasswordRecoverySubmit" type="submit" data-auth-copy="saveNewPassword">Сохранить пароль</button>
        </form>
        <p class="supabase-auth-message" id="supabasePasswordRecoveryMessage" role="status" aria-live="polite"></p>
      </section>
      <section id="supabaseOrganizationStage" hidden>
        <h1 data-auth-copy="createOrganizationTitle">Создать организацию</h1>
        <form id="supabaseOrganizationForm">
          <div class="supabase-auth-field">
            <label for="supabaseOrganizationName" data-auth-copy="companyName">Название компании</label>
            <input id="supabaseOrganizationName" autocomplete="organization" required>
          </div>
          <div class="supabase-auth-field">
            <label for="supabaseOrganizationCode" data-auth-copy="registrationCode">Регистрационный код</label>
            <input id="supabaseOrganizationCode" autocomplete="off">
          </div>
          <button class="supabase-auth-primary" id="supabaseOrganizationSubmit" type="submit" data-auth-copy="create">Создать</button>
        </form>
        <p class="supabase-auth-message" id="supabaseOrganizationMessage" role="status" aria-live="polite"></p>
      </section>
      <section id="supabaseConnectedStage" hidden>
        <h1 data-auth-copy="accountConnected">Аккаунт подключен</h1>
        <p class="supabase-auth-message" id="supabaseConnectedMessage"></p>
        <p class="supabase-auth-warning" data-auth-copy="dataNotConnected">Данные организации сохраняются в облаке. Для отправки счетов требуется настройка почтового сервиса.</p>
        <button class="supabase-auth-logout" id="supabaseSignOut" type="button" data-auth-copy="signOut">Выйти</button>
      </section>
        </section>
      </div>
    </div>`;
  document.body.append(root);

  const signInTab = document.getElementById("supabaseSignInTab");
  const signUpTab = document.getElementById("supabaseSignUpTab");
  const authForm = document.getElementById("supabaseAuthForm");
  const authSubmit = document.getElementById("supabaseAuthSubmit");
  const authSubmitLabel = document.getElementById("supabaseAuthSubmitLabel");
  const passwordInput = document.getElementById("supabaseAuthPassword");
  const signupConfirmField = document.getElementById("supabaseSignupConfirmField");
  const signupConfirmPassword = document.getElementById("supabaseSignupConfirmPassword");
  const passwordToggle = document.getElementById("supabasePasswordToggle");
  const confirmPasswordToggle = document.getElementById("supabaseConfirmPasswordToggle");
  const forgotPasswordButton = document.getElementById("supabaseForgotPassword");
  const recoveryStage = document.getElementById("supabasePasswordRecoveryStage");
  const recoveryForm = document.getElementById("supabasePasswordRecoveryForm");
  const recoverySubmit = document.getElementById("supabasePasswordRecoverySubmit");
  const recoveryMessage = document.getElementById("supabasePasswordRecoveryMessage");
  const googleButton = document.getElementById("supabaseGoogleButton");
  const guestButton = document.getElementById("supabaseGuestButton");
  const googleDivider = root.querySelector(".supabase-auth-divider");
  const authMessage = document.getElementById("supabaseAuthMessage");
  const resetRequestStage = document.getElementById("supabasePasswordResetRequestStage");
  const resetRequestForm = document.getElementById("supabasePasswordResetRequestForm");
  const resetEmailInput = document.getElementById("supabaseResetEmail");
  const resetEmailSubmit = document.getElementById("supabaseResetEmailSubmit");
  const resetBackToLogin = document.getElementById("supabaseResetBackToLogin");
  const resetEmailMessage = document.getElementById("supabaseResetEmailMessage");
  const organizationStage = document.getElementById("supabaseOrganizationStage");
  const organizationForm = document.getElementById("supabaseOrganizationForm");
  const organizationSubmit = document.getElementById("supabaseOrganizationSubmit");
  const organizationMessage = document.getElementById("supabaseOrganizationMessage");
  const connectedStage = document.getElementById("supabaseConnectedStage");
  const connectedMessage = document.getElementById("supabaseConnectedMessage");
  authForm.insertAdjacentElement("afterend", root.querySelector(".supabase-auth-tabs"));
  let mode = "sign-in";
  let supabaseClient;
  const authText = {
    ru: {
      signInTitle: "Вход в аккаунт", signUpTitle: "Создать аккаунт", signInTab: "Войти", signUpTab: "Регистрация",
      authMethods: "Способ авторизации",
      brandSubtitle: "Бухгалтерия компании", welcomeEyebrow: "Arvesemu · учет компании", welcomeTitle: "Добро пожаловать",
      welcomeDescription: "Ведите клиентов, выставляйте счета и контролируйте операции компании в одном месте.", welcomeNote: "Войдите в аккаунт или начните с гостевого режима.",
      email: "Электронная почта", password: "Пароль", confirmSignupPassword: "Подтвердите пароль", showPassword: "Показать пароль", hidePassword: "Скрыть пароль", signInAction: "Войти", signUpAction: "Зарегистрироваться",
      forgotPassword: "Забыли пароль?", resetPasswordTitle: "Восстановление пароля", sendResetLink: "Отправить ссылку", backToLogin: "Назад ко входу", resetEmailWait: "Отправляю ссылку…", resetEmailSent: "Если аккаунт с таким адресом существует, на него отправлена ссылка для сброса пароля.", resetEmailError: "Не удалось отправить ссылку для сброса пароля.",
      newPasswordTitle: "Установить новый пароль", newPassword: "Новый пароль", confirmPassword: "Повторите новый пароль", saveNewPassword: "Сохранить пароль", passwordMismatch: "Пароли не совпадают.", passwordUpdateWait: "Сохраняю новый пароль…", passwordUpdated: "Пароль обновлён.",
      googleAction: "Продолжить с Google", googleWait: "Переход к Google…", guestAction: "Войти как гость", or: "или",
      createOrganizationTitle: "Создать организацию", companyName: "Название компании", registrationCode: "Регистрационный код",
      create: "Создать", accountConnected: "Аккаунт подключен", dataNotConnected: "Данные организации сохраняются в облаке. Для отправки счетов требуется настройка почтового сервиса.",
      signOut: "Выйти", language: "Язык интерфейса", checkingOrganization: "Проверяю доступ к организации…",
      createAccountWait: "Создаю аккаунт…", signInWait: "Выполняю вход…", confirmEmail: "Аккаунт создан. Подтвердите адрес по ссылке из письма, затем войдите.",
      createOrganizationWait: "Создаю организацию…", signedOut: "Вы вышли из аккаунта.",
      checkOrganizationError: "Не удалось проверить организацию: ", loadOrganizationError: "Не удалось загрузить организацию: ",
      setupError: "Не удалось загрузить подключение Supabase. Проверьте конфигурацию и подключение к интернету."
    },
    et: {
      signInTitle: "Logi sisse", signUpTitle: "Loo konto", signInTab: "Logi sisse", signUpTab: "Registreeru", authMethods: "Autentimisviis",
      brandSubtitle: "Ettevõtte raamatupidamine", welcomeEyebrow: "Arvesemu · ettevõtte arvestus", welcomeTitle: "Tere tulemast",
      welcomeDescription: "Halda kliente, koosta arveid ja jälgi ettevõtte toiminguid ühes kohas.", welcomeNote: "Logi sisse või alusta külalisrežiimis.",
      email: "E-posti aadress", password: "Parool", confirmSignupPassword: "Kinnitage parool", showPassword: "Näita parooli", hidePassword: "Peida parool", signInAction: "Logi sisse", signUpAction: "Loo konto",
      forgotPassword: "Unustasid parooli?", resetPasswordTitle: "Parooli taastamine", sendResetLink: "Saada link", backToLogin: "Tagasi sisselogimise juurde", resetEmailWait: "Saadan lähtestamislinki…", resetEmailSent: "Kui selle aadressiga konto on olemas, saadetakse sellele parooli lähtestamise link.", resetEmailError: "Parooli lähtestamise linki ei õnnestunud saata.",
      newPasswordTitle: "Määra uus parool", newPassword: "Uus parool", confirmPassword: "Korda uut parooli", saveNewPassword: "Salvesta parool", passwordMismatch: "Paroolid ei kattu.", passwordUpdateWait: "Salvestan uut parooli…", passwordUpdated: "Parool on uuendatud.",
      googleAction: "Jätka Google'iga", googleWait: "Suunan Google'isse…", guestAction: "Sisene külalisena", or: "või",
      createOrganizationTitle: "Loo organisatsioon", companyName: "Ettevõtte nimi", registrationCode: "Registrikood",
      create: "Loo", accountConnected: "Konto on ühendatud", dataNotConnected: "Organisatsiooni andmed salvestatakse pilve. Arvete saatmiseks tuleb seadistada e-posti teenus.",
      signOut: "Logi välja", language: "Liidese keel", checkingOrganization: "Kontrollin organisatsiooni ligipääsu…",
      createAccountWait: "Loon kontot…", signInWait: "Sisselogimine…", confirmEmail: "Konto on loodud. Kinnita e-posti aadress kirjas oleva lingi kaudu ja logi seejärel sisse.",
      createOrganizationWait: "Loon organisatsiooni…", signedOut: "Logisid kontolt välja.",
      checkOrganizationError: "Organisatsiooni kontrollimine ebaõnnestus: ", loadOrganizationError: "Organisatsiooni laadimine ebaõnnestus: ",
      setupError: "Supabase'i ühendust ei õnnestunud laadida. Kontrolli seadistust ja internetiühendust."
    }
  };
  let language = "et";
  try {
    language = localStorage.getItem("accounting-language-choice") === "ru" ? "ru" : "et";
  } catch {}

  function translate(key) {
    return authText[language][key] || authText.ru[key] || key;
  }

  function applyLanguage() {
    document.documentElement.lang = language;
    document.title = "Arvesemu";
    root.querySelectorAll("[data-auth-language]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.authLanguage === language));
    });
    root.querySelectorAll("[data-auth-copy]").forEach((element) => {
      element.textContent = translate(element.dataset.authCopy);
    });
    document.querySelector(".supabase-auth-language").setAttribute("aria-label", translate("language"));
    document.querySelector(".supabase-auth-tabs").setAttribute("aria-label", translate("authMethods"));
    document.getElementById("supabaseAuthTitle").textContent = translate(mode === "sign-up" ? "signUpTitle" : "signInTitle");
    authSubmitLabel.textContent = translate(mode === "sign-up" ? "signUpAction" : "signInAction");
    signInTab.hidden = mode === "sign-in";
    signUpTab.hidden = mode === "sign-up";
    forgotPasswordButton.textContent = translate("forgotPassword");
    forgotPasswordButton.hidden = mode !== "sign-in";
    signupConfirmField.hidden = mode !== "sign-up";
    signupConfirmPassword.required = mode === "sign-up";
    passwordInput.autocomplete = mode === "sign-up" ? "off" : "current-password";
    signupConfirmPassword.autocomplete = "off";
    for (const [input, toggle] of [[passwordInput, passwordToggle], [signupConfirmPassword, confirmPasswordToggle]]) {
      const label = translate(input.type === "password" ? "showPassword" : "hidePassword");
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      toggle.setAttribute("aria-pressed", String(input.type === "text"));
    }
    root.querySelectorAll("[data-auth-message]").forEach((element) => {
      element.textContent = element.authTranslations[language] || element.authTranslations.ru;
    });
  }

  function setMessage(element, text, isError = false) {
    element.authTranslations = typeof text === "string"
      ? { ru: authText.ru[text] || text, et: authText.et[text] || text }
      : text;
    element.dataset.authMessage = "true";
    element.textContent = element.authTranslations[language] || element.authTranslations.ru;
    element.dataset.error = String(isError);
  }

  function showStage(stage) {
    const authVisible = stage === "auth";
    const resetRequestVisible = stage === "password-reset-request";
    const recoveryVisible = stage === "password-recovery";
    document.getElementById("supabaseAuthTitle").hidden = !authVisible;
    authForm.hidden = !authVisible;
    document.querySelector(".supabase-auth-tabs").hidden = !authVisible;
    googleButton.hidden = !authVisible;
    googleDivider.hidden = !authVisible;
    authMessage.hidden = stage !== "auth" && stage !== "loading";
    resetRequestStage.hidden = !resetRequestVisible;
    resetEmailMessage.hidden = !resetRequestVisible;
    recoveryStage.hidden = !recoveryVisible;
    recoveryMessage.hidden = !recoveryVisible;
    organizationStage.hidden = stage !== "organization";
    connectedStage.hidden = stage !== "connected";
  }

  function showSetupError(text) {
    showStage("auth");
    authForm.hidden = true;
    document.querySelector(".supabase-auth-tabs").hidden = true;
    googleButton.hidden = true;
    googleDivider.hidden = true;
    setMessage(authMessage, text, true);
    authMessage.hidden = false;
  }

  function setMode(nextMode) {
    mode = nextMode;
    const signingUp = mode === "sign-up";
    passwordInput.type = "password";
    signupConfirmPassword.type = "password";
    signupConfirmPassword.setCustomValidity("");
    if (!signingUp) signupConfirmPassword.value = "";
    applyLanguage();
    setMessage(authMessage, "");
  }

  for (const [input, toggle] of [[passwordInput, passwordToggle], [signupConfirmPassword, confirmPasswordToggle]]) {
    toggle.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      applyLanguage();
      input.focus();
    });
    input.addEventListener("input", () => signupConfirmPassword.setCustomValidity(""));
  }

  root.querySelectorAll("[data-auth-language]").forEach((button) => {
    button.addEventListener("click", () => {
      language = button.dataset.authLanguage;
      try {
        localStorage.setItem("accounting-language", language);
        localStorage.setItem("accounting-language-choice", language);
      } catch {}
      applyLanguage();
    });
  });

  applyLanguage();

  guestButton.addEventListener("click", () => {
    const guestUrl = new URL(window.location.href);
    guestUrl.searchParams.set("guest", crypto.randomUUID());
    guestUrl.hash = "";
    window.location.assign(guestUrl.href);
  });

  if (new URLSearchParams(window.location.search).has("guest")) {
    root.remove();
    document.documentElement.classList.remove("supabase-auth-required");
    window.GENERAR_ACCOUNTING_APP?.startGuest(language);
    return;
  }

  async function showUserState(user) {
    if (passwordRecoveryRequested) {
      showStage("password-recovery");
      return;
    }
    showStage("loading");
    setMessage(authMessage, "checkingOrganization");

    const { data: memberships, error: membershipError } = await supabaseClient
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id);

    if (membershipError) {
      showSetupError({ ru: `${authText.ru.checkOrganizationError}${membershipError.message}`, et: `${authText.et.checkOrganizationError}${membershipError.message}` });
      return;
    }
    if (passwordRecoveryRequested) {
      showStage("password-recovery");
      return;
    }

    if (!memberships.length) {
      setMessage(authMessage, "");
      showStage("organization");
      return;
    }

    const organizationIds = memberships.map((membership) => membership.organization_id);
    const { data: organization, error: organizationError } = await supabaseClient
      .from("organizations")
      .select("id, name, registration_code, kmkr_number, vat_registered, address, phone, email, bank_name, bank_swift, bank_iban")
      .eq("id", organizationIds[0])
      .single();

    if (organizationError) {
      showSetupError({ ru: `${authText.ru.loadOrganizationError}${organizationError.message}`, et: `${authText.et.loadOrganizationError}${organizationError.message}` });
      return;
    }

    try {
      if (!window.GENERAR_ACCOUNTING_APP?.connect) throw new Error("Application connection is unavailable.");
      await window.GENERAR_ACCOUNTING_APP.connect({ supabase: supabaseClient, user, organization, role: memberships[0].role, language });
        window.applyRoleAccess?.();
      document.documentElement.classList.remove("supabase-auth-required");
      root.remove();
    } catch (error) {
      showSetupError({ ru: `Не удалось загрузить данные организации: ${error.message}`, et: `Organisatsiooni andmete laadimine ebaõnnestus: ${error.message}` });
    }
  }

  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) {
    showSetupError("setupError");
    return;
  }

  supabaseClient = window.supabase.createClient(config.url, config.publishableKey);

  let passwordRecoveryRequested = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      passwordRecoveryRequested = true;
      showStage("password-recovery");
      document.getElementById("supabaseNewPassword").focus();
    }
  });

  signInTab.addEventListener("click", () => setMode("sign-in"));
  signUpTab.addEventListener("click", () => setMode("sign-up"));
  forgotPasswordButton.addEventListener("click", () => {
    resetEmailInput.value = document.getElementById("supabaseAuthEmail").value.trim();
    showStage("password-reset-request");
    setMessage(resetEmailMessage, "");
    resetEmailInput.focus();
  });
  resetBackToLogin.addEventListener("click", () => {
    setMode("sign-in");
    showStage("auth");
  });
  resetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!resetEmailInput.reportValidity()) return;
    resetEmailSubmit.disabled = true;
    setMessage(resetEmailMessage, "resetEmailWait");
    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.hash = "";
      const { error } = await supabaseClient.auth.resetPasswordForEmail(resetEmailInput.value.trim(), {
        redirectTo: redirectUrl.href
      });
      if (error) throw error;
      setMessage(resetEmailMessage, "resetEmailSent");
    } catch (error) {
      setMessage(resetEmailMessage, { ru: `${authText.ru.resetEmailError} ${error.message}`, et: `${authText.et.resetEmailError} ${error.message}` }, true);
    } finally {
      resetEmailSubmit.disabled = false;
    }
  });
  googleButton.addEventListener("click", async () => {
    googleButton.disabled = true;
    setMessage(authMessage, "googleWait");
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href }
      });
      if (error) throw error;
    } catch (error) {
      setMessage(authMessage, error.message || "Google sign-in failed.", true);
      googleButton.disabled = false;
    }
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authSubmit.disabled = true;
    setMessage(authMessage, mode === "sign-up" ? "createAccountWait" : "signInWait");

    try {
      const email = document.getElementById("supabaseAuthEmail").value.trim();
      const password = passwordInput.value;
      if (mode === "sign-up" && password !== signupConfirmPassword.value) {
        signupConfirmPassword.setCustomValidity(translate("passwordMismatch"));
        signupConfirmPassword.reportValidity();
        signupConfirmPassword.focus();
        setMessage(authMessage, "passwordMismatch", true);
        return;
      }
      signupConfirmPassword.setCustomValidity("");
      const result = mode === "sign-up"
        ? await supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.href }
        })
        : await supabaseClient.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;
      if (mode === "sign-up" && !result.data.session) {
        setMessage(authMessage, "confirmEmail");
        return;
      }
      if (result.data.user) await showUserState(result.data.user);
    } catch (error) {
      setMessage(authMessage, error.message || "Не удалось выполнить запрос.", true);
    } finally {
      authSubmit.disabled = false;
    }
  });

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("supabaseNewPassword").value;
    const confirmation = document.getElementById("supabaseConfirmPassword").value;
    if (password !== confirmation) {
      setMessage(recoveryMessage, "passwordMismatch", true);
      document.getElementById("supabaseConfirmPassword").focus();
      return;
    }
    recoverySubmit.disabled = true;
    setMessage(recoveryMessage, "passwordUpdateWait");
    try {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
      passwordRecoveryRequested = false;
      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
      const { data, error: userError } = await supabaseClient.auth.getUser();
      if (userError) throw userError;
      setMessage(recoveryMessage, "passwordUpdated");
      if (data.user) await showUserState(data.user);
    } catch (error) {
      setMessage(recoveryMessage, error.message || "Could not update password.", true);
    } finally {
      recoverySubmit.disabled = false;
    }
  });

  organizationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    organizationSubmit.disabled = true;
    setMessage(organizationMessage, "createOrganizationWait");

    try {
      const name = document.getElementById("supabaseOrganizationName").value.trim();
      const registrationCode = document.getElementById("supabaseOrganizationCode").value.trim() || null;
      const { error } = await supabaseClient.rpc("create_organization", {
        organization_name: name,
        organization_registration_code: registrationCode
      });
      if (error) throw error;
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError) throw userError;
      await showUserState(user);
    } catch (error) {
      setMessage(organizationMessage, error.message || "Не удалось создать организацию.", true);
    } finally {
      organizationSubmit.disabled = false;
    }
  });

  document.getElementById("supabaseSignOut").addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) setMessage(connectedMessage, error.message, true);
    else {
      setMode("sign-in");
      showStage("auth");
      authForm.hidden = false;
      document.querySelector(".supabase-auth-tabs").hidden = false;
      setMessage(authMessage, "signedOut");
    }
  });

  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) showSetupError(error.message);
    else if (passwordRecoveryRequested) showStage("password-recovery");
    else if (data.session?.user) showUserState(data.session.user);
  });
})();