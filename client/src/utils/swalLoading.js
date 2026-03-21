import Swal from "sweetalert2";

function waitForNextPaint() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

export async function runWithSwalLoader(
  { title = "Please wait", text = "Processing..." } = {},
  task,
) {
  Swal.fire({
    title,
    text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });

  await waitForNextPaint();

  try {
    return await task();
  } finally {
    if (Swal.isVisible()) {
      Swal.close();
    }
  }
}
