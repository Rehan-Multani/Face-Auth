# Face & Password Authentication Full-Stack App 🛡️

A production-ready, enterprise-grade authentication system with **Face Biometrics (Liveness & Anti-Replay)** and **Standard Email/Password** built using **React Native (Expo)**, **Node.js (Express)**, and **MongoDB**.

---

## 🌟 Key Features

* 🔐 **Dual Auth**: Email/Password + Biometric Face Sign-In.
* 🛡️ **Zero-Trust Security**: Bcrypt password hashing, JWT Access & Refresh Token Rotation with MongoDB TTL revocation.
* 👁️ **Face Biometrics & Anti-Spoofing**: Server-signed anti-replay challenges with 120s TTL and cosine similarity feature verification.
* 🗄️ **Hardware Storage**: Android Keystore / iOS Keychain via `expo-secure-store`.
* ⚡ **Production Defenses**: Helmet headers, NoSQL injection protection, rate limiting, and 15-minute account lockouts on repeated failures.
* 🚫 **Zero Fake Data**: Only real database records with strict loading, error, empty, and offline handling.

---

## 📁 Project Structure

```text
React Native/
├── backend/
│   ├── src/
│   │   ├── config/          # Database & Environment configuration
│   │   ├── controllers/     # Auth & Face controllers
│   │   ├── middleware/      # Auth, Rate limiting, Security & Errors
│   │   ├── models/          # User & RefreshToken Mongoose models
│   │   ├── routes/          # API endpoints (/api/auth)
│   │   ├── services/        # Face matching & Token rotation
│   │   └── validators/      # Input validation & sanitization
│   ├── tests/               # Unit test suite
│   ├── .env.example
│   └── package.json
└── my-react-native-app/
    ├── app/                 # Expo Router screens ((auth), (app))
    ├── src/
    │   ├── api/             # Centralized Axios client & API calls
    │   ├── components/      # Button, Input, Skeleton, Camera Guide
    │   ├── context/         # AuthContext & State management
    │   ├── hooks/           # useAuth, useNetworkStatus
    │   ├── services/        # SecureStorage & Face extraction
    │   └── constants/       # Design tokens & Config
    └── package.json
```

---

## 🚀 Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env   # Update your MongoDB URI & JWT secrets
npm start
```

### 2. Frontend Setup
```bash
cd my-react-native-app
npm install
npx expo start
```
