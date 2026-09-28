import { CameraOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { BackLink, LargeTitle, Notice, Screen } from '../../components/ui';
import { useCan } from '../../lib/auth';
import s from './admin.module.css';

/** Minimal typing of the Barcode Detection API (Chrome, Android). */
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

/** The pass token inside a scanned value: a /verify#<token> link or a bare token. */
function extractToken(value: string): string | null {
  const hashIndex = value.indexOf('/verify#');
  if (hashIndex >= 0) return value.slice(hashIndex + '/verify#'.length);
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value) ? value : null;
}

const SCAN_EVERY_MS = 200;
const MAX_SCAN_WIDTH = 640;

/**
 * In-app scanner for organizers at check-in. Uses the native BarcodeDetector
 * when the browser has one, and the jsQR decoder otherwise (iPhone).
 */
export default function ScanPass() {
  const canVerify = useCan('pass:verify');
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canVerify) return;
    let stopped = false;
    let timer = 0;
    let stream: MediaStream | null = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera. Use the phone camera app to scan the code instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        setError('Camera access was refused. Allow the camera for this site, or scan with the phone camera app.');
        return;
      }
      const element = video.current;
      if (!element || stopped) return;
      element.srcObject = stream;
      await element.play().catch(() => undefined);

      const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : (await import('jsqr')).default;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });

      const scan = async () => {
        if (stopped) return;
        let value: string | null = null;
        if (element.readyState >= element.HAVE_CURRENT_DATA && element.videoWidth > 0) {
          if (detector) {
            const codes = await detector.detect(element).catch(() => []);
            value = codes[0]?.rawValue ?? null;
          } else if (jsQR && context) {
            const scale = Math.min(1, MAX_SCAN_WIDTH / element.videoWidth);
            canvas.width = Math.round(element.videoWidth * scale);
            canvas.height = Math.round(element.videoHeight * scale);
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            value = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
          }
        }
        const token = value ? extractToken(value) : null;
        if (token) {
          stopped = true;
          navigate(`/verify#${token}`, { replace: true });
          return;
        }
        timer = window.setTimeout(() => void scan(), SCAN_EVERY_MS);
      };
      void scan();
    }

    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [canVerify, navigate]);

  if (!canVerify) return <Navigate to="/home" replace />;

  return (
    <Screen>
      <BackLink to="/admin">Admin</BackLink>
      <LargeTitle>Scan a pass</LargeTitle>
      {error ? (
        <Notice tone="orange" icon={<CameraOff aria-hidden />}>
          {error}
        </Notice>
      ) : (
        <>
          <div className={s.scanner}>
            <video ref={video} playsInline muted aria-label="Camera" />
            <div className={s.frame} aria-hidden />
          </div>
          <p className={s.scanHint}>Point the camera at the member&apos;s pass QR code.</p>
        </>
      )}
    </Screen>
  );
}
