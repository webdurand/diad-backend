import { MigrationInterface, QueryRunner } from "typeorm";

type UrlUpdate = {
    table: string;
    urlPrefix: string;
};

export class UpdateEntityUrlsToLibrary1772000000000 implements MigrationInterface {
    name = "UpdateEntityUrlsToLibrary1772000000000";

    private readonly urlUpdates: UrlUpdate[] = [
        { table: "conditions", urlPrefix: "library/conditions/" },
        { table: "rules", urlPrefix: "library/rules/" },
        { table: "spells", urlPrefix: "library/spells/" },
        { table: "magic_items", urlPrefix: "library/magic-items/" },
        { table: "levels", urlPrefix: "library/levels/" },
        { table: "subraces", urlPrefix: "library/subraces/" },
    ];

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const update of this.urlUpdates) {
            await queryRunner.query(
                `UPDATE "${update.table}" SET "url" = $1 || "slug"`,
                [update.urlPrefix]
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const update of this.urlUpdates) {
            await queryRunner.query(
                `UPDATE "${update.table}" SET "url" = NULL`
            );
        }
    }
}
