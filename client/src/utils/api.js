import axios from "axios";

// Uncomment this for production -- route
// const api = axios.create({
//   baseURL: "/api",
// });

// Uncomment this for local development
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

api.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 413 && !error.userMessage) {
      error.userMessage =
        error.response?.data?.message ||
        "Too many recipients selected for one request. Please retry with smaller contact sets or increase REQUEST_BODY_LIMIT on the server.";
    }

    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error, fallback = "Request failed") {
  return (
    error?.userMessage ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export default api;
