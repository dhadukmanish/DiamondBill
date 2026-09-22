// Explicit icon registry so the bundle only ships the icons the nav actually uses.
import { ArrowLeftRight, BadgeCheck, BadgeDollarSign, BarChart3, BookOpen, Boxes, Building2, Calculator, Circle, FlaskConical, Gem, Home, Landmark, LayoutDashboard, Package, Receipt, Scale, Settings, ShoppingCart, SlidersHorizontal, Store, UserCog, Users, Workflow, type LucideIcon } from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = { ArrowLeftRight, BadgeCheck, BadgeDollarSign, BarChart3, BookOpen, Boxes, Building2, Calculator, FlaskConical, Gem, Home, Landmark, LayoutDashboard, Package, Receipt, Scale, Settings, ShoppingCart, SlidersHorizontal, Store, UserCog, Users, Workflow };

export function Icon({ name, className }: { name?: string; className?: string }) {
  const C = (name && ICONS[name]) || Circle;
  return <C className={className} />;
}
