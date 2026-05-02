import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui-v2/card';
import { Button } from '../components/ui-v2/button';
import { Input } from '../components/ui-v2/input';
import { Label } from '../components/ui-v2/label';
import { PlexusMark } from '../components/brand/PlexusMark';

export const Login: React.FC = () => {
  const [key, setKey] = useState('');
  const { login, isAuthenticated } = useAuth();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError('Please enter a key');
      return;
    }
    setSubmitting(true);
    try {
      const valid = await login(key.trim());
      if (!valid) {
        setError('Invalid key');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <PlexusMark title="Plexus" className="mx-auto mb-4 h-12 w-12 text-foreground" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Enter your admin key for full access, or an API key secret for a scoped view of your
            key's activity.
          </p>
        </div>

        <Card className="rounded-xl">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                name="username"
                autoComplete="username"
                defaultValue="admin"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminKey">Admin key or API key secret</Label>
                <Input
                  id="adminKey"
                  type="password"
                  autoComplete="current-password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="sk-admin-… or sk-…"
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={error ? 'adminKey-error' : undefined}
                />
                {error && (
                  <p id="adminKey-error" className="text-xs text-danger">
                    {error}
                  </p>
                )}
              </div>

              <Button type="submit" size="lg" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Access Dashboard'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
