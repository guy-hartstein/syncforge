import { OnboardingPage } from './components/OnboardingPage'
import { ToastProvider } from './components/Toast'
import { ConfirmDialogProvider } from './components/ConfirmDialog'

function App() {
  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <OnboardingPage />
      </ConfirmDialogProvider>
    </ToastProvider>
  )
}

export default App
