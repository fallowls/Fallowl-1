import Keypad from "@/components/dialer/Keypad";
import { useAuth } from "@/hooks/use-auth";

export default function DialerPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please Log In</h2>
          <p className="text-gray-600">You need to be logged in to use the dialer.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-120px)] py-8">
      <Keypad />
    </div>
  );
}
