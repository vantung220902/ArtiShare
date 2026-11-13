import '@fontsource-variable/plus-jakarta-sans';
import { createRoot } from 'react-dom/client';
import '../../ui/styles.css';
// The side panel is the same app as the popup; only the frame around it differs (see
// `html.sidepanel` in styles.css).
import { App } from '../popup/App';

document.documentElement.classList.add('sidepanel');
createRoot(document.getElementById('root')!).render(<App surface="sidepanel" />);
