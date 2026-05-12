import { AuthForm } from '@/pages/auth/AuthForm'
import { useAuthForm } from '@/pages/auth/useAuthForm'

export default function Auth() {
  const {
    mode,
    email,
    password,
    confirmPassword,
    showPassword,
    error,
    fieldErrors,
    submitting,
    resetSent,
    handleEmailChange,
    handlePasswordChange,
    handleConfirmPasswordChange,
    toggleShowPassword,
    handleSubmit,
    switchMode,
  } = useAuthForm()

  return (
    <AuthForm
      mode={mode}
      email={email}
      password={password}
      confirmPassword={confirmPassword}
      showPassword={showPassword}
      error={error}
      fieldErrors={fieldErrors}
      submitting={submitting}
      resetSent={resetSent}
      onEmailChange={handleEmailChange}
      onPasswordChange={handlePasswordChange}
      onConfirmPasswordChange={handleConfirmPasswordChange}
      onToggleShowPassword={toggleShowPassword}
      onSubmit={handleSubmit}
      onSwitchMode={switchMode}
    />
  )
}
