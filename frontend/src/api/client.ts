import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY ?? '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
});

export default api;
