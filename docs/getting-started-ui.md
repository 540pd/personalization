# Getting the GCOS canvas running on your computer

This guide is for someone who has never run code before. Follow the steps in order. You only do
Part 1 and Part 2 once. After that, Part 4 is all you need each time.

**Time needed:** about 30 minutes the first time, 2 minutes after that.

**What you will end up with:** the GCOS canvas open in your web browser at
`http://localhost:3000`. It runs only on your computer, so nobody else can see it, and you cannot
break anything for the team.

> **About AI results.** This local setup doesn't connect to the real AI service. "Create Image"
> gives a **placeholder** (often a dark or empty picture) instead of a real image, and text panels
> reply with your own prompt starting with `[mock]`. That is expected. Everything else (the
> canvas, panels, frames, skills, agents) works normally.

---

## A few words you will see

| Word | What it means |
|---|---|
| **Terminal** | A window where you type commands instead of clicking. On Windows it is called **Command Prompt**; on a Mac it is called **Terminal**. |
| **Command** | A line of text you type (or paste) into the terminal, then press **Enter**. |
| **Repository (repo)** | The project's folder of files, stored on GitHub. |
| **Clone** | Download the repo to your computer in a way that can be updated later. |
| **Backend** | The behind-the-scenes part. It must be running for the canvas to work. |
| **Frontend** | The part you see in the browser. |

**Tip for pasting commands:** copy a command from this guide, click inside the terminal window, and
paste with **Ctrl+V** (Windows) or **Cmd+V** (Mac). If Ctrl+V does nothing on Windows, **right-click**
inside the window instead. Then press **Enter**.

---

## Part 1: Install two programs (one time only)

### 1.1 Install Node.js

Node.js is the engine that runs the project.

1. Go to <https://nodejs.org>.
2. Click the big button labelled **LTS** (it says "Recommended for most users"). The version number
   must be **20 or higher**.
3. Open the downloaded file and click **Next / Continue** through the installer, keeping every
   default option.
4. When it finishes, **restart your computer** (this avoids most "command not found" problems).

> On a work laptop the installer may ask for admin rights. If it is blocked, ask IT to install
> "Node.js LTS" for you.

### 1.2 Install GitHub Desktop

GitHub Desktop downloads the project and keeps it up to date, with buttons instead of commands.

1. Go to <https://desktop.github.com> and download it.
2. Install and open it.
3. When asked, click **Sign in to GitHub.com** and sign in with the GitHub account that has access to
   the project. Accept the default settings for the rest.

### 1.3 Check that Node.js works

1. Open a terminal:
   - **Windows:** press the **Windows key**, type `cmd`, and click **Command Prompt**.
   - **Mac:** press **Cmd+Space**, type `Terminal`, and press **Enter**.
2. Type this and press **Enter**:

   ```
   node -v
   ```

3. You should see something like `v20.11.0` or `v22.3.0`. Any number starting with 20 or higher is
   fine.
   - If you see **"not recognized"** or **"command not found"**, restart the computer and try again.
     If it still fails, repeat step 1.1.

You can close the terminal now.

---

## Part 2: Download the project (one time only)

1. Open **GitHub Desktop**.
2. Click **File → Clone repository…**
3. Click the **URL** tab and paste:

   ```
   https://github.com/AbhimanyuPd/GCOS-personalization
   ```

4. Under **Local path**, note where it will be saved (for example
   `C:\Users\yourname\Documents\GitHub\GCOS-personalization`). You can leave the default.
5. Click **Clone** and wait for it to finish.

**Find the folder path for later:** in GitHub Desktop, click **Repository → Show in Explorer**
(Windows) or **Show in Finder** (Mac). That is the project folder. Keep this window handy.

---

## Part 3: First-time setup (one time only)

You need **two terminal windows** open side by side: one for the backend, one for the frontend.
Both must stay open while you use the canvas.

### 3.1 Open a terminal inside the project's `backend` folder

**Windows (easiest way):**

1. Open the project folder (see the end of Part 2).
2. Double-click the **backend** folder to go inside it.
3. Click the **address bar** at the top of the Explorer window, type `cmd`, and press **Enter**.
   A Command Prompt opens, already in the right place.

**Mac:**

1. Open the project folder in Finder.
2. Right-click the **backend** folder and choose **New Terminal at Folder**.
   (If you don't see it: open **System Settings → Keyboard → Keyboard Shortcuts → Services** and
   tick **New Terminal at Folder**.)

### 3.2 Set up the backend

In that terminal, run these commands **one at a time** (paste, press Enter, wait for it to finish).

**Step A: create the settings file**

- Windows:

  ```
  copy .env.example .env
  ```

- Mac:

  ```
  cp .env.example .env
  ```

You do **not** need to edit this file. Leaving it as it is runs the app in local mode: no sign-in,
placeholder pictures.

**Step B: download the project's building blocks**

```
npm install
```

This takes 1 to 5 minutes and prints a lot of text. Yellow **"WARN"** lines are normal. Wait until
you can type again.

**Step C: start the backend**

```
npm run dev
```

After a few seconds you should see:

```
GCOS backend listening on http://localhost:4000
  storage: in-memory
  auth:    anonymous (no OAuth client)
```

**Leave this window open.** If you close it, the canvas stops working.

### 3.3 Set up the frontend (in a second terminal)

1. Open a **new** terminal in the project's **frontend** folder, the same way as step 3.1 but using
   the **frontend** folder instead of **backend**.
2. Run these one at a time.

**Step A: create the settings file**

- Windows:

  ```
  copy .env.local.example .env.local
  ```

- Mac:

  ```
  cp .env.local.example .env.local
  ```

Again, no need to edit it.

**Step B: download the building blocks** (takes a few minutes)

```
npm install
```

**Step C: start the frontend**

```
npm run dev
```

Wait until you see a line containing **`Ready`** and `http://localhost:3000`.

### 3.4 Open the canvas

1. Open **Google Chrome** (or Edge).
2. Go to:

   ```
   http://localhost:3000
   ```

3. The **first load takes 20 to 60 seconds** while it gets ready. After that it is fast.

You should see the canvas, with no sign-in screen. Done!

---

## Part 4: Every time after the first time

1. Open a terminal in the **backend** folder (step 3.1) and run:

   ```
   npm run dev
   ```

2. Open a second terminal in the **frontend** folder and run:

   ```
   npm run dev
   ```

3. Go to `http://localhost:3000` in the browser.

**To stop:** click inside each terminal and press **Ctrl+C** (on Mac too). If it asks
"Terminate batch job (Y/N)?", type `Y` and press **Enter**. Or just close both windows.

---

## Part 5: Getting the team's latest changes

Do this when the team says something new has been added.

1. Stop both terminals (Part 4, "To stop").
2. Open **GitHub Desktop**. Make sure **Current branch** at the top says **main**.
3. Click **Fetch origin**, then **Pull origin** if that button appears.
4. In the **backend** terminal run `npm install`, then `npm run dev`.
5. In the **frontend** terminal run `npm install`, then `npm run dev`.

Running `npm install` again picks up any new building blocks. It's quick when nothing changed.

> **Please don't change files in the project folder.** If GitHub Desktop shows "changed files" you
> didn't mean to make, ask the team before pulling.

---

## Your work on the canvas

- What you create is saved **in this browser on this computer only**. It is not shared with the
  team and won't appear on another computer or in another browser.
- Clearing your browser's history or site data will erase it.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `'node' is not recognized` or `command not found: node` | Restart the computer. If it still happens, reinstall Node.js (step 1.1). |
| `npm.ps1 cannot be loaded because running scripts is disabled` | You opened **PowerShell** instead of Command Prompt. Close it and open **Command Prompt** (step 3.1 opens the right one). |
| `npm ERR! enoent ... package.json` | The terminal is in the wrong folder. Close it and open one inside the **backend** or **frontend** folder (step 3.1). |
| `EADDRINUSE` or `port 4000 / 3000 is already in use` | It is already running in another terminal window. Find and use that window, or close all terminals and start again. |
| Browser says **"This site can't be reached"** | The frontend terminal isn't running or isn't ready yet. Check it shows `Ready`, then refresh. |
| The canvas loads but creating things shows errors | The **backend** terminal isn't running. Start it (Part 4, step 1). |
| `npm install` fails with network or `ECONNRESET` errors | Check your internet or VPN connection and run `npm install` again. |
| A sign-in screen appears | Someone edited `backend/.env`. Delete that file and repeat Part 3.2 Step A, then restart the backend. |
| Images are dark, blank or broken, or text starts with `[mock]` | That is expected in local mode (see the note at the top). |

**Still stuck?** Take a screenshot of **both** terminal windows and the browser, and send it to the
team.
