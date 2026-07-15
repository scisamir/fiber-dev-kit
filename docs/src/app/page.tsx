import Hero            from "@/components/home/Hero";
import WorkflowSection from "@/components/home/WorkflowSection";
import Packages        from "@/components/home/Packages";
import HowItWorks      from "@/components/home/HowItWorks";
import Roadmap         from "@/components/home/Roadmap";
import Footer          from "@/components/Footer";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <WorkflowSection />
      <Packages />
      <HowItWorks />
      <Roadmap />
      <Footer />
    </main>
  );
}
