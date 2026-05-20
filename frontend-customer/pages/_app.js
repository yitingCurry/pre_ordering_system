import '../styles.css';
import { LiffProvider } from '../context/LiffContext';

export default function App({ Component, pageProps }) {
  return (
    <LiffProvider>
      <Component {...pageProps} />
    </LiffProvider>
  );
}
