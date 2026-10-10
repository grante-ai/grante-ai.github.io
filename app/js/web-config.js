/* Settings for the WEBSITE version of Grante (grante.github.io).

   A website can't keep secrets: every visitor's browser downloads this file. That's OK for
   these values, which are made to be used from web pages. Never put a private key, a
   service-account key, or a Hugging Face token in here. */
export const CONFIG = {
  firebase: {
    apiKey: "AIzaSyDDSSCzGjM0jUDzkl0H1h60uckt9mNpX30",
    projectId: "narsan-grante",
  },
  emailjs: {
    serviceId: "service_ejezrmb",
    templateId: "template_h1m0agj",
    publicKey: "GCk13GgPyCTApC0zx",
    fromName: "Tango Bhat",
    signature: "Tango Bhat\nNarSan Founder",
  },
  // The address of your Hugging Face Space that runs Grante's AI, like
  // "https://your-name-grante-ai.hf.space"  (no slash at the end)
  spaceUrl: "https://tango301-grante-ai.hf.space",
};
