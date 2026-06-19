# Moviesda Web Search Portal

This is a full-stack project to search for movies and get direct file download links automatically.

It is split into two parts:
1. **`frontend/`**: The React + Vite website (web interface).
2. **`backend/`**: The Node.js web scraper and API server.

---

## Features

* **Quick Search**: Search movies by title, year, or actor collections.
* **Movie Poster & Details**: Shows the movie poster image, rating stars, director, cast list, genres, and description.
* **Direct Downloads**: Crawls folder paths recursively to find and list direct download server mirrors with file sizes, format, and resolution details.
* **Premium Theme**: Modern dark mode with glassmorphic cards and micro-animations.
* **Responsive**: Runs perfectly on desktop, tablet, and mobile browsers.

---

## How to Run Locally

### 1. Start the Backend API Server
Go to the backend folder, install dependencies, and start the node server:
```bash
cd backend
npm install
node index.js
```
The server will run on `http://localhost:3000`.

### 2. Start the Frontend Website
Go to the frontend folder, install dependencies, and start the development server:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## How to Deploy on Vercel

You can deploy both parts of this project to Vercel:

### 1. Deploy the Backend APIs
1. Add a new project in Vercel and select this repository.
2. Set the **Root Directory** to `backend`.
3. Set the Environment Variable:
   * `BASE_URL` = `https://moviesda32.com`
4. Deploy. Take note of your backend URL (e.g. `https://moviesda-backend.vercel.app`).

### 2. Deploy the Frontend Client
1. Add a new project in Vercel and select this repository.
2. Set the **Root Directory** to `frontend`.
3. Set the Environment Variable:
   * `VITE_API_BASE` = `https://<your-backend-vercel-url>/api` (make sure it uses **https**).
4. Deploy. Your portal is now live!
