# Ng Zhi Yao — Personal Website v2

7-page personal portfolio — light mode, editorial design.
Built for **GitHub Pages** with **Firebase Realtime Database** for editable content.

---

## 📁 Files

| File | Page |
|------|------|
| `index.html` | Home |
| `clubs.html` | Clubs & Associations |
| `education.html` | Education |
| `investment.html` | Investment Portfolio |
| `experience.html` | Work Experience |
| `skills.html` | Skills & Tools |
| `certificates.html` | Certificates & Licences |
| `style.css` | Shared styles |
| `script.js` | Firebase + edit mode logic |

---

## 🚀 Deploy to GitHub Pages

1. Create a **public** GitHub repo (e.g. `ngzhiyao`)
2. Upload **all files** to the repo root
3. Go to **Settings → Pages** → Source: `main` branch → root → **Save**
4. Live at: `https://yourusername.github.io/ngzhiyao/`

---

## 🔥 Set Up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → name it anything → Create
3. **Build → Realtime Database** → Create → Start in **test mode**
4. **Project Settings** (gear icon) → **Your apps** → click `</>` Web → Register
5. Copy the `firebaseConfig` object
6. Open `script.js`, replace `FIREBASE_CONFIG` with your values:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

7. Push updated `script.js` to GitHub

---

## ✏️ Editing Content

1. Visit any page on your live site
2. Click **"Edit Page"** (top right)
3. Enter password: `ngzy2025` *(change in `script.js`!)*
4. Click any text to edit it inline
5. Click **"Save"** — content saved to Firebase

To change password, edit this line in `script.js`:
```js
const EDIT_PASSWORD = "ngzy2025";
```

---

## 🖼 Add Your Profile Photo

In `index.html`, replace the monogram:
```html
<!-- Remove: -->
<div class="profile-monogram">NZY</div>

<!-- Add: -->
<img class="profile-monogram" src="photo.jpg" alt="Ng Zhi Yao"
     style="object-fit:cover;" />
```
Upload `photo.jpg` to the repo root.

---

Built with plain HTML, CSS, JS + Firebase. No build tools required.
