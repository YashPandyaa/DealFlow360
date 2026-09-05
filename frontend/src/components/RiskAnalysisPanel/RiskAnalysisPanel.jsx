import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Percent,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  DollarSign,
  Info
} from 'lucide-react';

export default function RiskAnalysisPanel({ riskAnalysis, quotation }) {
  // Extract or fallback to quotation risk data
  const data = riskAnalysis || quotation?.riskAnalysis || null;

  if (!data) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 text-slate-400 text-sm flex items-center gap-3">
        <Info className="w-5 h-5 text-slate-400 shrink-0" />
        <span>Add line items or set customer details to view live risk analysis and approval routing.</span>
      </div>
    );
  }

  const riskScore = data.risk_score !== undefined ? data.risk_score : (data.blendedRiskScore || 0);
  const riskLevel = data.risk_level || (riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW');
  const components = data.components || {
    discount_ceiling_risk: 0,
    margin_risk: 0,
    blended_order_risk: 0,
    historical_anomaly_risk: 0,
    historical_data_status: 'Insufficient historical data',
    gross_margin_percentage: 0,
    weighted_excess: 0
  };
  const violations = data.violations || data.flaggedLines || [];
  const approval = data.approval || {
    required: data.requiresApproval || false,
    steps: data.requiredApprovalChain === 'MANAGER_THEN_FINANCE' ? ['SALES_MANAGER', 'FINANCE_OPERATIONS'] : data.requiresApproval ? ['SALES_MANAGER'] : []
  };

  const getLevelBadgeColor = (level) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/40';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'LOW':
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    }
  };

  const getScoreBarColor = (score) => {
    if (score >= 75) return 'bg-gradient-to-r from-orange-500 to-red-500';
    if (score >= 50) return 'bg-gradient-to-r from-amber-500 to-orange-500';
    if (score >= 25) return 'bg-gradient-to-r from-emerald-500 to-amber-500';
    return 'bg-gradient-to-r from-teal-500 to-emerald-500';
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-6 shadow-xl backdrop-blur-md">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border ${getLevelBadgeColor(riskLevel)}`}>
            {riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? (
              <ShieldAlert className="w-6 h-6" />
            ) : riskLevel === 'MEDIUM' ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-100">Blended Risk Analysis</h3>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${getLevelBadgeColor(riskLevel)}`}>
                {riskLevel} RISK
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Evaluates discount ceilings, gross margin, blended order excess, and sales rep historical anomalies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="text-right">
            <span className="text-xs text-slate-400 uppercase tracking-wider block">Risk Score</span>
            <span className="text-2xl font-black text-slate-100">{riskScore} <span className="text-sm font-normal text-slate-500">/ 100</span></span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-400">
          <span>0 (Low Risk)</span>
          <span>25 (Medium)</span>
          <span>50 (High)</span>
          <span>75+ (Critical)</span>
        </div>
        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getScoreBarColor(riskScore)}`}
            style={{ width: `${Math.min(100, Math.max(2, riskScore))}%` }}
          />
        </div>
      </div>

      {/* 4 Component Score Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Component 1: Discount Ceiling Risk */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3.5 space-y-1.5">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Percent className="w-3.5 h-3.5 text-cyan-400" />
              Discount Ceiling
            </span>
            <span className="font-semibold text-slate-300">Max 50</span>
          </div>
          <div className="text-xl font-bold text-slate-100">
            {components.discount_ceiling_risk || 0} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Line-level discount ceiling violations.
          </p>
        </div>

        {/* Component 2: Margin Risk */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3.5 space-y-1.5">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Margin Exposure
            </span>
            <span className="font-semibold text-slate-300">Max 25</span>
          </div>
          <div className="text-xl font-bold text-slate-100">
            {components.margin_risk || 0} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Gross Margin: <span className="font-semibold text-emerald-400">{components.gross_margin_percentage || 0}%</span>
          </p>
        </div>

        {/* Component 3: Blended Order Risk */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3.5 space-y-1.5">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Blended Order Risk
            </span>
            <span className="font-semibold text-slate-300">Max 15</span>
          </div>
          <div className="text-xl font-bold text-slate-100">
            {components.blended_order_risk || 0} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Weighted Excess: <span className="font-semibold text-amber-400">{components.weighted_excess || 0}%</span>
          </p>
        </div>

        {/* Component 4: Historical Anomaly */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3.5 space-y-1.5">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
              Historical Anomaly
            </span>
            <span className="font-semibold text-slate-300">Max 10</span>
          </div>
          <div className="text-xl font-bold text-slate-100">
            {components.historical_anomaly_risk || 0} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight truncate">
            {components.has_sufficient_history
              ? `Avg ${components.historical_avg_discount}% vs Current ${components.current_avg_discount}%`
              : 'Insufficient historical data'}
          </p>
        </div>
      </div>

      {/* Violations Table */}
      {violations.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Line Item Violations ({violations.length})
          </h4>
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2 px-3">Product / Category</th>
                  <th className="py-2 px-3 text-right">Applied %</th>
                  <th className="py-2 px-3 text-right">Allowed Ceiling</th>
                  <th className="py-2 px-3 text-right">Excess %</th>
                  <th className="py-2 px-3 text-right">Line Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                {violations.map((v, idx) => {
                  const applied = v.applied_discount !== undefined ? v.applied_discount : v.discountPercent;
                  const allowed = v.allowed_discount !== undefined ? v.allowed_discount : v.allowedLimit;
                  const excessVal = v.excess !== undefined ? v.excess : v.overage;
                  const lineRisk = v.line_risk !== undefined ? v.line_risk : Math.min(50, (excessVal / 20) * 50);

                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-2 px-3 font-medium text-slate-200">
                        {v.product || v.category} <span className="text-slate-500 font-normal">({v.category})</span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-rose-400">{applied}%</td>
                      <td className="py-2 px-3 text-right text-slate-400">{allowed}%</td>
                      <td className="py-2 px-3 text-right font-bold text-amber-400">+{excessVal}%</td>
                      <td className="py-2 px-3 text-right font-bold text-orange-400">{lineRisk} pts</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>All discount line items are within allowed customer-tier and category ceilings.</span>
        </div>
      )}

      {/* Approval Workflow Pathway */}
      <div className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <span className="text-slate-400 font-medium">Required Approval Chain:</span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700 font-medium">
            Sales Rep (Submit)
          </span>

          {approval.required ? (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 font-semibold">
                Sales Manager
              </span>
              {approval.steps.includes('FINANCE_OPERATIONS') && (
                <>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 rounded border border-rose-500/40 font-semibold">
                    Finance Operations
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/40 font-semibold">
                Auto-Approved / Ready for Fulfillment
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
