const mysql = require('mysql2/promise');

const main = async (page = 0) => {
	// Configurações do banco de dados
	const dbConfigLocal = {
		host: 'localhost',
		user: 'root',
		password: 'r00t14789632',
		database: 'matrix',
	};

	const dbConfigLocalProd = {
		host: 'matrix.hcode.com.br',
		user: 'root',
		password: 'tYLBaU7Vqc',
		database: 'matrix',
	};

	// Conexão persistente
	const connection = await mysql.createConnection(dbConfigLocal);
	const pageSize = 1000;

	try {
		const [rows] = await connection.execute(
			`SELECT id, text FROM course_content_transcripts WHERE id >= 81036 ORDER BY id LIMIT ${pageSize} OFFSET ${
				page * pageSize
			}`,
		);

		//console.log('PAGE:', page, rows.length);

		if (rows.length > 0) {
			// Crie uma nova conexão para o UPDATE
			const updateConnection = await mysql.createConnection(
				dbConfigLocalProd,
			);

			try {
				for (let i = 0; i < rows.length; i++) {
					console.log(`PAGE: ${page} - INDEX: ${i}`);
					/*console.log(
						`UPDATE course_content_transcripts SET text = '${rows[
							i
						].text.trim()}' WHERE id = ${rows[i].id};`,
					);*/
					await updateConnection.execute(
						'UPDATE course_content_transcripts SET text = ? WHERE id = ?',
						[rows[i].text, rows[i].id],
					);
				}
			} finally {
				await updateConnection.end();
			}

			// Próxima página
			page += 1;

			await main(page);
		}
	} catch (error) {
		console.error('Error:', error);
	} finally {
		await connection.end();
	}
};

main().catch(console.error);
