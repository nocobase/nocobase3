import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  brand: 'NocoBase setup',
  form: {
    title: 'Install your application',
    description:
      'Configure the database for this application. A secure authentication secret will be generated automatically.',
    database: 'Database',
    databaseFile: 'Database file',
    databaseName: 'Database name',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    password: 'Password',
    schema: 'Schema',
    useSsl: 'Use SSL',
    charset: 'Character set',
    debugLogging: 'Enable database debug logging',
    save: 'Save configuration',
    saving: 'Saving configuration…',
  },
  success: {
    eyebrow: 'Setup complete',
    title: 'Database configuration saved',
    description:
      'Your database settings are saved. Restart the application to finish setup. This page will continue checking and take you to the sign-in screen when the application is ready.',
    nextStep: 'Next step',
    restartTitle: 'Restart the application',
    restartDescription:
      'Use your process manager or the NocoBase Hub Restart action, then return here. You do not need to submit the form again.',
    waiting: 'Waiting for the application to restart…',
    checking: 'Checking application status…',
    ready: 'Application is ready. Redirecting…',
    checkAgain: 'Check again',
  },
  errors: {
    save: 'Unable to save the application configuration.',
    status: 'Unable to check the installation status.',
    statusDescription:
      'Make sure the application server is running, then try again.',
    retry: 'Try again',
  },
};

export type InstallClientResource = LocaleResource<typeof enUS>;

export default enUS;
