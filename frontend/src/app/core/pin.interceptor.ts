import { HttpInterceptorFn } from '@angular/common/http';
import { savedPin } from './api.service';

/** Sends the saved sharing PIN with every request when the app talks to another computer. */
export const pinInterceptor: HttpInterceptorFn = (req, next) => {
  const pin = savedPin();
  return next(pin ? req.clone({ setHeaders: { 'X-Canto-Pin': pin } }) : req);
};
