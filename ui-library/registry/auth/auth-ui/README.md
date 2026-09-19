# NocoBase Authentication UI

Application-owned authentication UI backed by
`@nocobase/app-plugin-authentication`.

This registry item is preinstalled into application templates at:

```text
client/extensions/nocobase-auth-ui/
```

After materialization, the files belong to the application and may be edited
freely. The item includes the page layout, form tabs, SSO button group, four
password forms, branding and marketing panel. The application composes each
authentication route directly with `AuthLayout`:

```tsx
<AuthLayout
  logo={<AuthBrand light={<YourLightLogo />} dark={<YourDarkLogo />} />}
  forms={[
    { id: 'password', label: 'Password', content: <PasswordLoginForm /> },
    { id: 'ldap', label: 'LDAP', content: <YourLdapForm /> },
  ]}
  sso={
    <AuthSsoButtons
      providers={[
        { id: 'google', label: 'Google', onClick: signInWithGoogle },
        { id: 'github', label: 'GitHub', onClick: signInWithGitHub },
      ]}
    />
  }
  marketing={<YourMarketingPanel />}
  title='Welcome back'
  description='Sign in with your username or email and password.'
/>
```

Use `form` for one form, or `forms` for multiple authentication methods. The
`forms` prop renders an accessible tab switcher, so an application can combine
password, LDAP, passkey, or other application-owned forms in one page. Each
provided form renders its own standard navigation and status footer.
`AuthSsoButtons` renders any number of SSO providers below the forms. The
application owns route declarations, branding, SSO actions, and marketing
content; a custom form can replace a built-in form and its footer.

The authentication plugin remains responsible for the auth client, session
state, guards, providers, and headless actions. Forms should use the plugin's
stable `client/actions` export; page routes and links belong to the application
that installs this item. Do not import plugin-internal components or add another
copy of shadcn primitives.
