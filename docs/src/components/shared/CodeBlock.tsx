import CopyBtn from "./CopyBtn";
const plain = (h: string) => h.replace(/<[^>]+>/g, "");
export default function CodeBlock({ code, label = "ts" }: { code: string; label?: string }) {
  return (
    <div className="code-wrap">
      <div className="code-top">
        <span>{label}</span>
        <CopyBtn text={plain(code)} />
      </div>
      <div className="code-body">
        <pre className="code-font" dangerouslySetInnerHTML={{ __html: code }} />
      </div>
    </div>
  );
}
