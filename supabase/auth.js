(() => {
  const config = window.GENERAR_SUPABASE_CONFIG;
  const root = document.createElement("main");
  root.id = "supabase-auth-root";
  root.innerHTML = `
    <section class="supabase-auth-panel" aria-labelledby="supabaseAuthTitle">
      <div class="supabase-auth-topline">
        <p class="supabase-auth-brand">Arvesemu</p>
        <div class="supabase-auth-language" role="group" aria-label="Язык интерфейса">
          <button type="button" data-auth-language="ru" aria-pressed="true">RU</button>
          <button type="button" data-auth-language="et" aria-pressed="false">ET</button>
        </div>
      </div>
      <h1 id="supabaseAuthTitle" data-auth-copy="signInTitle">Вход в аккаунт</h1>
      <div class="supabase-auth-tabs" role="tablist" aria-label="Авторизация">
        <button type="button" id="supabaseSignInTab" role="tab" aria-selected="true" data-auth-copy="signInTab">Войти</button>
        <button type="button" id="supabaseSignUpTab" role="tab" aria-selected="false" data-auth-copy="signUpTab">Регистрация</button>
      </div>
      <form id="supabaseAuthForm">
        <div class="supabase-auth-field">
          <label for="supabaseAuthEmail" data-auth-copy="email">Электронная почта</label>
          <input id="supabaseAuthEmail" type="email" autocomplete="email" required>
        </div>
        <div class="supabase-auth-field">
          <label for="supabaseAuthPassword" data-auth-copy="password">Пароль</label>
          <input id="supabaseAuthPassword" type="password" minlength="8" autocomplete="current-password" required>
        </div>
        <button class="supabase-auth-forgot" id="supabaseForgotPassword" type="button" data-auth-copy="forgotPassword">Забыли пароль?</button>
        <button class="supabase-auth-primary" id="supabaseAuthSubmit" type="submit" data-auth-copy="signInAction">Войти</button>
      </form>
      <div class="supabase-auth-divider" data-auth-copy="or">или</div>
      <button class="supabase-google-button" id="supabaseGoogleButton" type="button">
        <img class="supabase-google-mark" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="">
        <span data-auth-copy="googleAction">Продолжить с Google</span>
      </button>
      <p class="supabase-auth-message" id="supabaseAuthMessage" role="status" aria-live="polite"></p>
      <section id="supabasePasswordRecoveryStage" hidden>
        <h1 data-auth-copy="newPasswordTitle">Установить новый пароль</h1>
        <form id="supabasePasswordRecoveryForm">
          <div class="supabase-auth-field">
            <label for="supabaseNewPassword" data-auth-copy="newPassword">Новый пароль</label>
            <input id="supabaseNewPassword" type="password" minlength="8" autocomplete="new-password" required>
          </div>
          <div class="supabase-auth-field">
            <label for="supabaseConfirmPassword" data-auth-copy="confirmPassword">Повторите новый пароль</label>
            <input id="supabaseConfirmPassword" type="password" minlength="8" autocomplete="new-password" required>
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
        <p class="supabase-auth-warning" data-auth-copy="dataNotConnected">Облачное хранение клиентов, счетов и остальных данных ещё не подключено. Пока не вносите сюда реальные бухгалтерские данные.</p>
        <button class="supabase-auth-logout" id="supabaseSignOut" type="button" data-auth-copy="signOut">Выйти</button>
      </section>
    </section>`;
  document.body.append(root);

  const signInTab = document.getElementById("supabaseSignInTab");
  const signUpTab = document.getElementById("supabaseSignUpTab");
  const authForm = document.getElementById("supabaseAuthForm");
  const authSubmit = document.getElementById("supabaseAuthSubmit");
  const forgotPasswordButton = document.getElementById("supabaseForgotPassword");
  const recoveryStage = document.getElementById("supabasePasswordRecoveryStage");
  const recoveryForm = document.getElementById("supabasePasswordRecoveryForm");
  const recoverySubmit = document.getElementById("supabasePasswordRecoverySubmit");
  const recoveryMessage = document.getElementById("supabasePasswordRecoveryMessage");
  const googleButton = document.getElementById("supabaseGoogleButton");
  const googleDivider = root.querySelector(".supabase-auth-divider");
  const authMessage = document.getElementById("supabaseAuthMessage");
  const organizationStage = document.getElementById("supabaseOrganizationStage");
  const organizationForm = document.getElementById("supabaseOrganizationForm");
  const organizationSubmit = document.getElementById("supabaseOrganizationSubmit");
  const organizationMessage = document.getElementById("supabaseOrganizationMessage");
  const connectedStage = document.getElementById("supabaseConnectedStage");
  const connectedMessage = document.getElementById("supabaseConnectedMessage");
  let mode = "sign-in";
  let supabaseClient;
  const authText = {
    ru: {
      signInTitle: "Вход в аккаунт", signUpTitle: "Создать аккаунт", signInTab: "Войти", signUpTab: "Регистрация",
      authMethods: "Способ авторизации",
      email: "Электронная почта", password: "Пароль", signInAction: "Войти", signUpAction: "Зарегистрироваться",
      forgotPassword: "Забыли пароль?", resetEmailWait: "Отправляю ссылку…", resetEmailSent: "Если аккаунт с таким адресом существует, на него отправлена ссылка для сброса пароля.", resetEmailError: "Не удалось отправить ссылку для сброса пароля.",
      newPasswordTitle: "Установить новый пароль", newPassword: "Новый пароль", confirmPassword: "Повторите новый пароль", saveNewPassword: "Сохранить пароль", passwordMismatch: "Пароли не совпадают.", passwordUpdateWait: "Сохраняю новый пароль…", passwordUpdated: "Пароль обновлён.",
      googleAction: "Продолжить с Google", googleWait: "Переход к Google…", or: "или",
      createOrganizationTitle: "Создать организацию", companyName: "Название компании", registrationCode: "Регистрационный код",
      create: "Создать", accountConnected: "Аккаунт подключен", dataNotConnected: "Облачное хранение клиентов, счетов и остальных данных ещё не подключено. Пока не вносите сюда реальные бухгалтерские данные.",
      signOut: "Выйти", language: "Язык интерфейса", checkingOrganization: "Проверяю доступ к организации…",
      createAccountWait: "Создаю аккаунт…", signInWait: "Выполняю вход…", confirmEmail: "Аккаунт создан. Подтвердите адрес по ссылке из письма, затем войдите.",
      createOrganizationWait: "Создаю организацию…", signedOut: "Вы вышли из аккаунта.",
      checkOrganizationError: "Не удалось проверить организацию: ", loadOrganizationError: "Не удалось загрузить организацию: ",
      setupError: "Не удалось загрузить подключение Supabase. Проверьте конфигурацию и подключение к интернету."
    },
    et: {
      signInTitle: "Logi sisse", signUpTitle: "Loo konto", signInTab: "Logi sisse", signUpTab: "Registreeru", authMethods: "Autentimisviis",
      email: "E-posti aadress", password: "Parool", signInAction: "Logi sisse", signUpAction: "Loo konto",
      forgotPassword: "Unustasid parooli?", resetEmailWait: "Saadan lähtestamislinki…", resetEmailSent: "Kui selle aadressiga konto on olemas, saadetakse sellele parooli lähtestamise link.", resetEmailError: "Parooli lähtestamise linki ei õnnestunud saata.",
      newPasswordTitle: "Määra uus parool", newPassword: "Uus parool", confirmPassword: "Korda uut parooli", saveNewPassword: "Salvesta parool", passwordMismatch: "Paroolid ei kattu.", passwordUpdateWait: "Salvestan uut parooli…", passwordUpdated: "Parool on uuendatud.",
      googleAction: "Jätka Google'iga", googleWait: "Suunan Google'isse…", or: "või",
      createOrganizationTitle: "Loo organisatsioon", companyName: "Ettevõtte nimi", registrationCode: "Registrikood",
      create: "Loo", accountConnected: "Konto on ühendatud", dataNotConnected: "Klientide, arvete ja muude andmete pilvesalvestus pole veel ühendatud. Palun ära sisesta siia päris raamatupidamisandmeid.",
      signOut: "Logi välja", language: "Liidese keel", checkingOrganization: "Kontrollin organisatsiooni ligipääsu…",
      createAccountWait: "Loon kontot…", signInWait: "Sisselogimine…", confirmEmail: "Konto on loodud. Kinnita e-posti aadress kirjas oleva lingi kaudu ja logi seejärel sisse.",
      createOrganizationWait: "Loon organisatsiooni…", signedOut: "Logisid kontolt välja.",
      checkOrganizationError: "Organisatsiooni kontrollimine ebaõnnestus: ", loadOrganizationError: "Organisatsiooni laadimine ebaõnnestus: ",
      setupError: "Supabase'i ühendust ei õnnestunud laadida. Kontrolli seadistust ja internetiühendust."
    }
  };
  let language = "ru";
  try {
    language = localStorage.getItem("accounting-language") === "et" ? "et" : "ru";
  } catch {}

  function translate(key) {
    return authText[language][key] || authText.ru[key] || key;
  }

  function applyLanguage() {
    document.documentElement.lang = language;
    document.title = language === "et" ? "Arvesemu | Arved" : "Arvesemu | Счета";
    root.querySelectorAll("[data-auth-language]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.authLanguage === language));
    });
    root.querySelectorAll("[data-auth-copy]").forEach((element) => {
      element.textContent = translate(element.dataset.authCopy);
    });
    document.querySelector(".supabase-auth-language").setAttribute("aria-label", translate("language"));
    document.querySelector(".supabase-auth-tabs").setAttribute("aria-label", translate("authMethods"));
    document.getElementById("supabaseAuthTitle").textContent = translate(mode === "sign-up" ? "signUpTitle" : "signInTitle");
    authSubmit.textContent = translate(mode === "sign-up" ? "signUpAction" : "signInAction");
    forgotPasswordButton.textContent = translate("forgotPassword");
    forgotPasswordButton.hidden = mode !== "sign-in";
    document.getElementById("supabaseAuthPassword").autocomplete = mode === "sign-up" ? "new-password" : "current-password";
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
    const recoveryVisible = stage === "password-recovery";
    document.getElementById("supabaseAuthTitle").hidden = !authVisible;
    authForm.hidden = !authVisible;
    document.querySelector(".supabase-auth-tabs").hidden = !authVisible;
    googleButton.hidden = !authVisible;
    googleDivider.hidden = !authVisible;
    authMessage.hidden = stage !== "auth" && stage !== "loading";
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
    signInTab.setAttribute("aria-selected", String(!signingUp));
    signUpTab.setAttribute("aria-selected", String(signingUp));
    applyLanguage();
    setMessage(authMessage, "");
  }

  root.querySelectorAll("[data-auth-language]").forEach((button) => {
    button.addEventListener("click", () => {
      language = button.dataset.authLanguage;
      try {
        localStorage.setItem("accounting-language", language);
      } catch {}
      applyLanguage();
    });
  });

  applyLanguage();

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
      .select("id, name, registration_code, address")
      .eq("id", organizationIds[0])
      .single();

    if (organizationError) {
      showSetupError({ ru: `${authText.ru.loadOrganizationError}${organizationError.message}`, et: `${authText.et.loadOrganizationError}${organizationError.message}` });
      return;
    }

    try {
      if (!window.GENERAR_ACCOUNTING_APP?.connect) throw new Error("Application connection is unavailable.");
      await window.GENERAR_ACCOUNTING_APP.connect({ supabase: supabaseClient, user, organization, role: memberships[0].role, language });
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
  forgotPasswordButton.addEventListener("click", async () => {
    const emailInput = document.getElementById("supabaseAuthEmail");
    if (!emailInput.reportValidity()) return;
    forgotPasswordButton.disabled = true;
    setMessage(authMessage, "resetEmailWait");
    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.hash = "";
      const { error } = await supabaseClient.auth.resetPasswordForEmail(emailInput.value.trim(), {
        redirectTo: redirectUrl.href
      });
      if (error) throw error;
      setMessage(authMessage, "resetEmailSent");
    } catch (error) {
      setMessage(authMessage, { ru: `${authText.ru.resetEmailError} ${error.message}`, et: `${authText.et.resetEmailError} ${error.message}` }, true);
    } finally {
      forgotPasswordButton.disabled = false;
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
      const password = document.getElementById("supabaseAuthPassword").value;
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