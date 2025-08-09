// utils/sendEmail.js
import emailjs from '@emailjs/browser';

// Inicializar EmailJS con tu Public Key
const SERVICE_ID  = 'service_kfvdwhb';
const TEMPLATE_ID = 'template_oplcp9l';
const PUBLIC_KEY  = 'ciUQlZ31DIgnq6SK9';

emailjs.init(PUBLIC_KEY);

/**
 * Envía código de verificación al email proporcionado
 * @param {string} userEmail - Email del destinatario
 * @param {string} code - Código de verificación de 6 dígitos
 */
export async function sendCodeEmail(userEmail, code) {
  // Verificar que emailjs está importado
  if (!emailjs) {
    throw new Error('EmailJS no está inicializado');
  }

  // Preparar parámetros según plantilla
  const templateParams = {
    user_email: userEmail,
    codigo:     code,
  };

  // Loguear payload para debugging
  console.log('📩 Enviando con EmailJS payload:', templateParams);

  // Enviar email
  const response = await emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    templateParams
  ).catch(err => {
    console.error('EmailJS error:', err);
    throw new Error('No se pudo enviar el email de verificación');
  });
  return response;
}
