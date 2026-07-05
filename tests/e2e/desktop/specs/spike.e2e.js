// FEASIBILITY SPIKE — the go/no-go gate for the whole desktop harness.
//
// Goal: prove tauri-driver + WebdriverIO can attach to the *installed release*
// exe on Windows and read a known element. It does NOT log in and NEVER touches
// data — it only reads the pre-auth login screen, so it is 100% non-destructive.
//
// The login screen renders:  <h1 ...>TAJ Pharmacy</h1>  (src/pages/Login.tsx:53)
// plus input[name="username"] and input[name="password"].

describe('SPIKE: attach to installed release exe', () => {
  it('launches the app and reads the login screen title', async () => {
    // WebView2 cold start on a real machine can take several seconds.
    const title = await $('h1=TAJ Pharmacy');
    await title.waitForExist({ timeout: 60000 });
    await expect(title).toHaveText('TAJ Pharmacy');
  });

  it('sees the login form inputs (confirms React app mounted)', async () => {
    const username = await $('input[name="username"]');
    const password = await $('input[name="password"]');
    await expect(username).toBeExisting();
    await expect(password).toBeExisting();
  });
});
