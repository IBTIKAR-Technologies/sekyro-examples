// A Server Component: renders the shell on the server and hands the client
// component the Server Actions it may call.
import { finishWithTestData, listUsers, readUser, readVerdict, startRecheck, startStepUp, startVerification } from "./actions";
import { Verification } from "./verification";

export default function Page() {
  return (
    <main>
      <h1>Sekyro AI Next.js sample</h1>
      <Verification
        listUsers={listUsers}
        readUser={readUser}
        startVerification={startVerification}
        startRecheck={startRecheck}
        startStepUp={startStepUp}
        readVerdict={readVerdict}
        // Development only: the action refuses outside `next dev`, and the
        // client component does not render the button in a production build.
        finishWithTestData={process.env.NODE_ENV === "development" ? finishWithTestData : undefined}
      />
    </main>
  );
}
