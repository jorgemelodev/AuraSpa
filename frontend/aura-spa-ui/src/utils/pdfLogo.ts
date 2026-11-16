// Carga y cachea el logo con letras como base64 para usarlo en el header de los PDFs (jsPDF).
let logoPromise: Promise<string> | null = null;

export const getLogoBase64 = (): Promise<string> => {
  if (!logoPromise) {
    logoPromise = fetch('/Logo_con_letras.png')
      .then(r => r.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      }));
  }
  return logoPromise;
};
