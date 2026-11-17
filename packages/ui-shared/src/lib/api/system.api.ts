import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.tokens';

export interface SystemStatus {
  readonly maintenance: boolean;
  readonly message?: string;
  readonly signupsOpen: boolean;
}

@Injectable({ providedIn: 'root' })
export class SystemApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  status(): Observable<SystemStatus> {
    return this.http.get<SystemStatus>(`${this.baseUrl}/system/status`);
  }
}
