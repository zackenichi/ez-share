export const appConfig = {
  name: process.env.APP_NAME || 'AppName',
  logoUrl: process.env.APP_LOGO_URL,
  eyebrow: process.env.APP_EYEBROW || 'Your workspace, simplified',
  title: process.env.APP_TITLE || 'Everything you need, all in one place.',
  description:
    process.env.APP_DESCRIPTION ||
    'A clear, focused home for your team to move work forward and stay in sync.',
};
