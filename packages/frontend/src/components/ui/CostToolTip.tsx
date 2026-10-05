import React from 'react';
import { Tooltip } from './Tooltip';

interface CostToolTipProps {
  source?: string;
  costMetadata?: string;
  costBreakdown?: {
    input: string;
    output: string;
    cached: string;
    cacheWrite: string;
  };
  children: React.ReactNode;
}

export const CostToolTip: React.FC<CostToolTipProps> = ({
  source,
  costMetadata,
  costBreakdown,
  children,
}) => {
  let content: React.ReactNode = 'No details';

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--foreground)',
    minWidth: '180px',
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: 'bold',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '4px',
    marginBottom: '4px',
    // textTransform: 'capitalize'
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '60px 1fr',
    gap: '4px 12px',
    alignItems: 'center',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--foreground-muted)',
    textAlign: 'left',
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    textAlign: 'right',
  };

  const formatRate = (val: any) => {
    if (val === undefined || val === null) return '0';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return String(val);
    if (num === 0) return '0';

    // Use toFixed with high precision to avoid scientific notation, then trim trailing zeros
    return num.toFixed(10).replace(/\.?0+$/, '');
  };

  let attribution: React.ReactNode = null;
  try {
    const parsed = costMetadata ? JSON.parse(costMetadata) : {};
    const data = parsed || {};
    const upstreamModel = data.upstream_model ?? data.upstreamModel;
    const pricingModel = data.pricing_model ?? data.pricingModel;
    const pricingFallback = data.pricing_fallback ?? data.pricingFallback;
    const isProviderReported = (source || '').toLowerCase() === 'provider_reported';
    if (upstreamModel || pricingModel || (pricingFallback && !isProviderReported)) {
      attribution = (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '4px',
            marginTop: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {pricingModel ? (
            <span style={{ color: 'var(--foreground-muted)', fontSize: '11px' }}>
              Pricing model:{' '}
              <span style={{ fontFamily: 'monospace', color: 'var(--foreground)' }}>
                {String(pricingModel)}
              </span>
            </span>
          ) : null}
          {upstreamModel && upstreamModel !== pricingModel ? (
            <span style={{ color: 'var(--foreground-muted)', fontSize: '11px' }}>
              Upstream:{' '}
              <span style={{ fontFamily: 'monospace', color: 'var(--foreground)' }}>
                {String(upstreamModel)}
              </span>
            </span>
          ) : null}
          {pricingFallback && !isProviderReported ? (
            <span style={{ color: 'var(--warning-text)', fontSize: '11px', fontWeight: 600 }}>
              Route pricing used — upstream price unavailable
            </span>
          ) : null}
        </div>
      );
    }

    // Normalize source comparison
    const s = (source || '').toLowerCase();

    if (s === 'simple') {
      content = (
        <div style={containerStyle}>
          <div style={headerStyle}>Source: Simple</div>
          <div style={gridStyle}>
            <span style={labelStyle}>Input:</span>
            <span style={valueStyle}>{formatRate(data.input)}</span>

            <span style={labelStyle}>Output:</span>
            <span style={valueStyle}>{formatRate(data.output)}</span>

            <span style={labelStyle}>Cached:</span>
            <span style={valueStyle}>{formatRate(data.cached)}</span>
          </div>
        </div>
      );
    } else if (s === 'defined') {
      // Handle both new (flat rates) and old (full config) formats
      const isNewFormat = data.input !== undefined;

      content = (
        <div style={containerStyle}>
          <div style={headerStyle}>Source: Defined</div>
          {isNewFormat ? (
            <div style={gridStyle}>
              <span style={labelStyle}>Input:</span>
              <span style={valueStyle}>{formatRate(data.input)}</span>

              <span style={labelStyle}>Output:</span>
              <span style={valueStyle}>{formatRate(data.output)}</span>
            </div>
          ) : (
            <div style={{ color: 'var(--foreground-muted)', fontStyle: 'italic' }}>
              Range-based configuration
            </div>
          )}
        </div>
      );
    } else if (s === 'per_request') {
      content = (
        <div style={containerStyle}>
          <div style={headerStyle}>Source: Per Request</div>
          <div style={gridStyle}>
            <span style={labelStyle}>Amount:</span>
            <span style={valueStyle}>${formatRate(data.amount)}</span>
          </div>
          <div
            style={{
              color: 'var(--foreground-muted)',
              fontStyle: 'italic',
              fontSize: '11px',
              marginTop: '4px',
            }}
          >
            Flat fee per API call
          </div>
        </div>
      );
    } else if (s === 'provider_reported') {
      // Support both SSE `: cost` format (request_cost_usd) and usage.cost_details format
      const reportedCost = data.request_cost_usd ?? data.cost_details?.total_cost;
      content = (
        <div style={containerStyle}>
          <div style={headerStyle}>Source: Provider Reported</div>
          <div style={gridStyle}>
            <span style={labelStyle}>Cost:</span>
            <span style={valueStyle}>${formatRate(reportedCost)}</span>

            {data.cache_savings_usd !== undefined && (
              <>
                <span style={labelStyle}>Saved:</span>
                <span style={{ ...valueStyle, color: 'var(--success-text)' }}>
                  ${formatRate(data.cache_savings_usd)}
                </span>
              </>
            )}

            {data.allowance_remaining_usd !== undefined && (
              <>
                <span style={labelStyle}>Allowance:</span>
                <span style={valueStyle}>${formatRate(data.allowance_remaining_usd)}</span>
              </>
            )}

            {data.budget_remaining_usd !== undefined && (
              <>
                <span style={labelStyle}>Budget:</span>
                <span style={valueStyle}>${formatRate(data.budget_remaining_usd)}</span>
              </>
            )}
          </div>
          <div
            style={{
              color: 'var(--foreground-muted)',
              fontStyle: 'italic',
              fontSize: '11px',
              marginTop: '4px',
            }}
          >
            Actual cost reported by provider
          </div>
        </div>
      );
    } else if (s === 'openrouter') {
      content = (
        <div style={containerStyle}>
          <div style={headerStyle}>Pricing Source: OpenRouter</div>
          <div
            style={{
              ...headerStyle,
              borderBottom: 'none',
              fontSize: '11px',
              color: 'var(--foreground-muted)',
            }}
          >
            {data.slug || 'Unknown'}
          </div>
          <div style={gridStyle}>
            <span style={labelStyle}>Input:</span>
            <span style={valueStyle}>{formatRate(data.prompt)}</span>

            <span style={labelStyle}>Output:</span>
            <span style={valueStyle}>{formatRate(data.completion)}</span>

            <span style={labelStyle}>Cached:</span>
            <span style={valueStyle}>{formatRate(data.input_cache_read)}</span>

            <span style={{ ...labelStyle, color: 'var(--success-text)' }}>Discounted:</span>
            <span style={{ ...valueStyle, color: 'var(--success-text)' }}>
              {Number(data?.discount) > 0 ? `${(data.discount * 100).toFixed(0)}%` : 'None'}
            </span>
          </div>
        </div>
      );
    } else {
      // Fallback for unknown sources
      content = (
        <div style={containerStyle}>
          <div style={headerStyle}>Source: {source}</div>
          <pre style={{ fontSize: '11px', overflow: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
      );
    }
  } catch (e) {
    content = <span style={{ color: 'var(--danger-text)' }}>Error parsing metadata</span>;
  }

  const tooltipContent = costBreakdown ? (
    <div style={{ ...containerStyle, minWidth: '200px' }}>
      <div style={headerStyle}>Cost breakdown</div>
      <div style={gridStyle}>
        <span style={labelStyle}>Input:</span>
        <span style={valueStyle}>{costBreakdown.input}</span>

        <span style={labelStyle}>Output:</span>
        <span style={valueStyle}>{costBreakdown.output}</span>

        <span style={labelStyle}>Cached:</span>
        <span style={valueStyle}>{costBreakdown.cached}</span>

        <span style={labelStyle}>Cache write:</span>
        <span style={valueStyle}>{costBreakdown.cacheWrite}</span>
      </div>
      {source && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '4px' }}>
          {content}
          {attribution}
        </div>
      )}
      {!source && attribution ? attribution : null}
    </div>
  ) : (
    <>
      {content}
      {attribution}
    </>
  );

  return (
    <Tooltip content={tooltipContent} variant="surface">
      {children}
    </Tooltip>
  );
};
